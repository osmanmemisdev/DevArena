import asyncio
import ast
import json
import os
import re
import time
from datetime import datetime, timezone
from typing import Any, AsyncIterator
from uuid import uuid4

import httpx

from schemas import AnalyzeRequest, Finding

CRITIC_MODEL = "nvidia/nemotron-3-ultra-550b-a55b"
FAST_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b"
ROUTER_MODEL = FAST_MODEL
CODER_MODEL = FAST_MODEL
REFINER_MODEL = "google/gemini-3.8-flash"
FAST_REFINER_MODEL = "google/gemini-3.5-flash-lite"
GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
NIM_READ_TIMEOUT_SECONDS = 180.0


def _base_url() -> str:
    return os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1").rstrip("/")


async def _chat(client: httpx.AsyncClient, model: str, messages: list[dict[str, str]], *, json_mode: bool = False, max_tokens: int = 2200, required_json_fields: tuple[str, ...] = ()) -> tuple[str, int]:
    api_key = os.getenv("NVIDIA_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("NVIDIA_API_KEY is not configured")
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": max_tokens,
        # OpenAI SDK's extra_body is flattened into this field in the HTTP JSON body.
        "chat_template_kwargs": {"enable_thinking": False},
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    response = await client.post(f"{_base_url()}/chat/completions", json=payload, headers={"Authorization": f"Bearer {api_key}"})
    response.raise_for_status()
    body = response.json()
    message = body["choices"][0]["message"]
    content = _message_text(message.get("content"))
    reasoning = _message_text(message.get("reasoning_content"))
    if json_mode and reasoning:
        candidates: list[dict[str, Any]] = []
        for candidate_text in (content, reasoning):
            if not candidate_text:
                continue
            try:
                candidates.append(_extract_json(candidate_text))
            except (json.JSONDecodeError, ValueError):
                continue
        if candidates and required_json_fields:
            merged: dict[str, Any] = {}
            for candidate in candidates:
                for key, value in candidate.items():
                    if value not in (None, "", [], {}) and merged.get(key) in (None, "", [], {}):
                        merged[key] = value
            content = json.dumps(merged, ensure_ascii=False)
        elif candidates:
            selected = max(candidates, key=lambda candidate: len(candidate))
            content = json.dumps(selected, ensure_ascii=False)
        elif not content:
            content = reasoning
    if not content.strip():
        content = reasoning
    tokens = int(body.get("usage", {}).get("total_tokens", 0))
    if not content.strip():
        raise RuntimeError(f"Empty response from {model}")
    return content, tokens


def _message_text(value: Any) -> str:
    """Normalize string and OpenAI-style multipart content without exposing metadata."""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and item.get("type") in {"text", "output_text"}:
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(part for part in parts if part.strip()).strip()
    return ""


async def _select_fast_chat_model(client: httpx.AsyncClient) -> str:
    """Pick a catalog model and verify chat support before routing and code generation."""
    api_key = os.getenv("NVIDIA_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("NVIDIA_API_KEY is not configured")
    response = await client.get(f"{_base_url()}/models", headers={"Authorization": f"Bearer {api_key}"})
    response.raise_for_status()
    models = response.json().get("data", [])
    ids = [item.get("id") for item in models if isinstance(item, dict) and isinstance(item.get("id"), str)]
    preferred_id = "meta/llama-3.3-70b-instruct"
    eligible = [
        model_id for model_id in ids
        if any(term in model_id.lower() for term in ("llama", "qwen", "deepseek"))
        and not any(term in model_id.lower() for term in ("embed", "retriever", "safety", "guard", "video"))
    ]
    candidates = ([preferred_id] if preferred_id in eligible else [])
    candidates.extend(model_id for model_id in eligible if model_id not in candidates)
    if FAST_MODEL in ids and FAST_MODEL not in candidates:
        candidates.append(FAST_MODEL)
    candidates.extend(model_id for model_id in ids if "coder" in model_id.lower() and model_id not in candidates)
    for model_id in candidates:
        try:
            probe, _ = await _chat(client, model_id, [{"role": "user", "content": "Reply with only OK."}], max_tokens=16)
            if probe.strip():
                return model_id
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code not in {400, 404, 410, 422}:
                raise
    return CRITIC_MODEL


def _extract_json(content: str) -> dict[str, Any]:
    text = content.strip().lstrip("\ufeff")
    fenced = re.search(r"```\s*(?:json)?\s*([\s\S]*?)\s*```", text, flags=re.IGNORECASE)
    cleaned = fenced.group(1).strip() if fenced else text
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        if start < 0:
            raise
        depth = 0
        in_string = False
        escaped = False
        end = -1
        for index in range(start, len(cleaned)):
            char = cleaned[index]
            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
                continue
            if char == '"':
                in_string = True
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    end = index + 1
                    break
        if end < 0:
            raise
        parsed = json.loads(cleaned[start:end])
    if not isinstance(parsed, dict):
        raise ValueError("Model response JSON must be an object")
    return parsed


async def _json_chat(client: httpx.AsyncClient, model: str, messages: list[dict[str, str]], *, max_tokens: int) -> tuple[dict[str, Any], int]:
    raw, tokens = await _chat(client, model, messages, json_mode=True, max_tokens=max_tokens)
    try:
        return _extract_json(raw), tokens
    except (json.JSONDecodeError, ValueError):
        compact_messages = messages + [{
            "role": "user",
            "content": "Your previous response was not valid JSON. Re-run the requested task and return exactly one compact, valid JSON object matching the requested schema. Limit findings to 6 concise items; do not use markdown fences.",
        }]
        retry_raw, retry_tokens = await _chat(client, model, compact_messages, json_mode=True, max_tokens=max_tokens)
        return _extract_json(retry_raw), tokens + retry_tokens


def _gemini_api_keys() -> list[str]:
    configured = os.getenv("GEMINI_API_KEYS", "").strip()
    if not configured:
        configured = os.getenv("GEMINI_API_KEY", "").strip()
    return list(dict.fromkeys(key.strip() for key in configured.split(",") if key.strip()))


def _gemini_output_text(body: dict[str, Any]) -> str:
    direct = body.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()
    parts: list[str] = []
    for step in body.get("steps", []):
        if not isinstance(step, dict) or step.get("type") != "model_output":
            continue
        for item in step.get("content", []):
            if isinstance(item, dict) and item.get("type") == "text" and isinstance(item.get("text"), str):
                parts.append(item["text"])
    return "\n".join(part for part in parts if part.strip()).strip()


async def _gemini_refiner_chat(
    client: httpx.AsyncClient,
    model: str,
    messages: list[dict[str, str]],
    *,
    max_tokens: int,
    required_fields: tuple[str, ...],
) -> tuple[str, int]:
    keys = _gemini_api_keys()
    if not keys:
        raise RuntimeError("Refiner için GEMINI_API_KEYS .env içinde tanımlı değil.")
    system_instruction = next((message["content"] for message in messages if message.get("role") == "system"), "")
    user_input = "\n\n".join(
        f"{message.get('role', 'user').upper()}:\n{message.get('content', '')}"
        for message in messages if message.get("role") != "system"
    )
    properties: dict[str, dict[str, str]] = {
        "final_code": {"type": "string"},
        "unit_tests": {"type": "string"},
        "score": {"type": "integer"},
        "rationale": {"type": "string"},
    }
    schema = {
        "type": "object",
        "properties": {field: properties[field] for field in required_fields},
        "required": list(required_fields),
    }
    payload = {
        "model": model.removeprefix("google/"),
        "system_instruction": system_instruction,
        "input": user_input,
        "generation_config": {"max_output_tokens": max_tokens, "thinking_level": "low", "thinking_summaries": "none"},
        "response_format": {"type": "text", "mime_type": "application/json", "schema": schema},
        "store": False,
    }
    last_error = "Gemini API isteği başarısız oldu."
    for index, api_key in enumerate(keys):
        try:
            response = await client.post(
                GEMINI_INTERACTIONS_URL,
                json=payload,
                headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            )
        except httpx.TimeoutException as exc:
            raise RuntimeError(f"Gemini Refiner yanıt vermedi ({type(exc).__name__}); süre sınırı 180 saniye.") from exc
        except httpx.HTTPError as exc:
            raise RuntimeError(f"Gemini Refiner bağlantı hatası: {type(exc).__name__}.") from exc
        if response.status_code >= 400:
            try:
                error_body = response.json().get("error", {})
                detail = str(error_body.get("message", "")).strip()
            except (ValueError, AttributeError):
                detail = ""
            last_error = f"Gemini API HTTP {response.status_code}: {detail[:300] or response.reason_phrase}"
            if response.status_code in {401, 403, 429} and index < len(keys) - 1:
                continue
            raise RuntimeError(last_error)
        try:
            body = response.json()
        except ValueError as exc:
            raise RuntimeError("Gemini API geçerli JSON yanıtı döndürmedi.") from exc
        status = str(body.get("status", "completed"))
        if status == "failed":
            errors = body.get("errors", [])
            detail = errors[0].get("message", "") if errors and isinstance(errors[0], dict) else ""
            raise RuntimeError(f"Gemini Refiner işlemi tamamlayamadı: {str(detail)[:300] or 'bilinmeyen API hatası'}")
        output = _gemini_output_text(body)
        if not output:
            raise RuntimeError(f"Gemini Refiner boş yanıt döndürdü (durum: {status}).")
        tokens = int(body.get("usage", {}).get("total_tokens", 0))
        return output, tokens
    raise RuntimeError(last_error)


def _code_block(text: str) -> str:
    match = re.search(r"```(?:[\w+#.-]+)?\s*\n(.*?)```", text, flags=re.DOTALL)
    return (match.group(1) if match else text).strip()


def _findings(data: Any) -> list[Finding]:
    if not isinstance(data, list):
        return []
    result = []
    for item in data[:30]:
        if not isinstance(item, dict):
            continue
        severity = str(item.get("severity", "MEDIUM")).upper()
        if severity not in {"CRITICAL", "HIGH", "MEDIUM", "LOW"}:
            severity = "MEDIUM"
        result.append(Finding(severity=severity, title=str(item.get("title", "Finding"))[:160], line=item.get("line", "—"), description=str(item.get("description", ""))[:1200], category=str(item.get("category", "Security"))[:80]))
    return result


async def live_pipeline(request: AnalyzeRequest, progress_callback=None) -> dict[str, Any]:
    started = time.perf_counter()
    timeout = httpx.Timeout(NIM_READ_TIMEOUT_SECONDS, connect=10.0)
    stages: list[dict[str, Any]] = []
    if progress_callback:
        progress_callback({"id": "routing", "status": "running", "model": "NVIDIA NIM", "elapsed_ms": 0, "tokens": 0, "output": {"preview": "Bağlantı hazırlanıyor ve istek değerlendiriliyor."}})
    async with httpx.AsyncClient(timeout=timeout) as client:
        response_language = "Turkish" if request.response_language == "tr" else "English"
        fast_model = await _select_fast_chat_model(client)
        critic_model = fast_model if request.review_depth == "fast" else CRITIC_MODEL
        refiner_model = FAST_REFINER_MODEL if request.review_depth == "fast" else REFINER_MODEL
        t = time.perf_counter()
        task_description = request.prompt if request.analysis_mode == "generate" else (
            "Review the supplied code for security issues, bugs, edge cases, and performance, then provide a safe corrected version and pytest tests."
            if request.response_language == "en" else
            "Verilen kodu güvenlik açıkları, hatalar, uç durumlar ve performans açısından incele; güvenli düzeltilmiş sürümünü ve pytest testlerini üret."
        )
        if progress_callback:
            progress_callback({"id": "routing", "status": "running", "model": fast_model, "elapsed_ms": 0, "tokens": 0, "output": {"preview": "İstek ve risk inceleniyor."}})
        routing, route_tokens = await _json_chat(client, fast_model, [
            {"role": "system", "content": f"You are a software task router. Return JSON only with keys complexity (Low/Medium/High), risk (Security/Correctness/Performance/Privacy), plan (array of 3 concise steps), rationale (one sentence). Write every human-readable value in {response_language}; keep enum values as specified."},
            {"role": "user", "content": f"Programming language: {request.language}\nResponse language: {response_language}\nMode: {request.analysis_mode}\nTask: {task_description}"},
        ], max_tokens=500)
        stages.append({"id": "routing", "model": fast_model, "elapsed_ms": round((time.perf_counter() - t) * 1000), "tokens": route_tokens, "output": routing})
        if progress_callback:
            progress_callback(stages[-1])

        if request.analysis_mode == "audit":
            draft = (request.code or "").strip()
            stage = {"id": "generating", "status": "skipped", "model": "Skipped · supplied source", "elapsed_ms": 0, "tokens": 0, "output": {"preview": "Using the code supplied for review."}}
            stages.append(stage)
            if progress_callback:
                progress_callback(stage)
        else:
            t = time.perf_counter()
            if progress_callback:
                progress_callback({"id": "generating", "status": "running", "model": fast_model, "elapsed_ms": 0, "tokens": 0, "output": {"preview": "İlk kod taslağı hazırlanıyor."}})
            draft_raw, code_tokens = await _chat(client, fast_model, [
                {"role": "system", "content": f"You are a senior {request.language} engineer. Produce a complete, realistic implementation only, inside a fenced code block. Include safe defaults and clear interfaces. Write comments and human-facing messages in {response_language}; keep identifiers and language syntax conventional."},
                {"role": "user", "content": request.prompt},
            ], max_tokens=4200)
            draft = _code_block(draft_raw)
            stage = {"id": "generating", "model": fast_model, "elapsed_ms": round((time.perf_counter() - t) * 1000), "tokens": code_tokens, "output": {"preview": draft[:1000]}}
            stages.append(stage)
            if progress_callback:
                progress_callback(stage)

        t = time.perf_counter()
        if progress_callback:
            progress_callback({"id": "critiquing", "status": "running", "model": critic_model, "elapsed_ms": 0, "tokens": 0, "output": {"preview": "Kod güvenlik ve hata açısından inceleniyor."}})
        critique, critic_tokens = await _json_chat(client, critic_model, [
            {"role": "system", "content": f"Audit the supplied code for security vulnerabilities, edge cases, correctness, memory and performance. Return one valid JSON object only: {{\"score\": integer 0-100, \"findings\": [{{\"severity\":\"CRITICAL|HIGH|MEDIUM|LOW\",\"title\":string,\"line\":number|string,\"description\":string,\"category\":string}}], \"summary\": string}}. Include at most 6 concise findings, one short sentence each. Be specific and do not invent findings. Write title, description, category and summary in {response_language}; keep severity values in English."},
            {"role": "user", "content": f"Mode: {request.analysis_mode}\nProgramming language: {request.language}\nResponse language: {response_language}\nTask: {task_description}\nCode to audit:\n{draft}"},
        ], max_tokens=1800)
        findings = _findings(critique.get("findings", []))
        initial_score = max(0, min(100, int(critique.get("score", 50))))
        stages.append({"id": "critiquing", "model": critic_model, "elapsed_ms": round((time.perf_counter() - t) * 1000), "tokens": critic_tokens, "output": {"score": initial_score, "findings": [x.model_dump() for x in findings], "summary": str(critique.get("summary", ""))}})
        if progress_callback:
            progress_callback(stages[-1])

        t = time.perf_counter()
        if progress_callback:
            progress_callback({"id": "refining", "status": "running", "model": refiner_model, "elapsed_ms": 0, "tokens": 0, "output": {"preview": "Düzeltme ve testler hazırlanıyor."}})
        refine_messages = [
            {"role": "system", "content": f"You are a senior {request.language} engineer and test author. Address every valid finding and preserve the specified behavior. Return one valid JSON object only with keys final_code (complete raw source, no fences), unit_tests (complete runnable native test source; for Python import application symbols from solution), score (integer 0-100), rationale (brief). Tests must cover only requirements stated in the task and concrete security fixes; do not invent input validation rules or other behavior. Ensure tests call names that exist in final_code and mentally verify each assertion against it. Escape newlines and quotes correctly in JSON strings. Keep source code and tests in {response_language} for all user-facing comments and messages. Human-readable findings and rationale must be in {response_language}."},
            {"role": "user", "content": f"Task: {task_description}\nFindings: {json.dumps([x.model_dump() for x in findings], ensure_ascii=False)}\nResponse language: {response_language}\nSource code to improve:\n{draft}"},
        ]
        refine_raw, refine_tokens = await _gemini_refiner_chat(client, refiner_model, refine_messages, max_tokens=12000 if request.review_depth == "fast" else 24000, required_fields=("final_code", "unit_tests"))
        refined: dict[str, Any] = {}
        final_code = ""
        tests = ""
        for attempt in range(3):
            try:
                attempt_result = _extract_json(refine_raw)
            except (json.JSONDecodeError, ValueError):
                attempt_result = {}
            candidate_code = str(attempt_result.get("final_code", "")).strip()
            candidate_tests = str(attempt_result.get("unit_tests", attempt_result.get("tests", ""))).strip()
            if candidate_code:
                refined["final_code"] = candidate_code
            if candidate_tests:
                refined["unit_tests"] = candidate_tests
            if "score" in attempt_result:
                refined["score"] = attempt_result["score"]
            final_code = refined.get("final_code", "")
            tests = refined.get("unit_tests", "")
            if final_code and tests:
                syntax_errors = []
                if request.language == "Python":
                    for filename, source in (("final_code", final_code), ("unit_tests", tests)):
                        try:
                            ast.parse(source, filename=filename)
                        except SyntaxError as exc:
                            syntax_errors.append(
                                f"{filename}:{exc.lineno or '?'}: {exc.msg}"
                            )
                if not syntax_errors:
                    break
            else:
                syntax_errors = []
            if attempt == 2:
                break
            if syntax_errors:
                retry_instruction = (
                    "Your previous response contained invalid Python syntax: "
                    + "; ".join(syntax_errors)
                    + ". Correct the syntax and return one complete valid JSON object with both "
                    "final_code and unit_tests. The test file must use valid pytest function definitions "
                    "such as def test_example():, and every test must match the returned final_code. "
                    "Do not use markdown fences.\nPrevious final_code:\n"
                    f"{final_code}\nPrevious unit_tests:\n{tests}"
                )
                retry_budget = 12000 if request.review_depth == "fast" else 18000
                retry_messages = refine_messages + [{"role": "user", "content": retry_instruction}]
                refine_raw, retry_tokens = await _gemini_refiner_chat(
                    client,
                    refiner_model,
                    retry_messages,
                    max_tokens=retry_budget,
                    required_fields=("final_code", "unit_tests"),
                )
                refine_tokens += retry_tokens
                continue
            missing = []
            if not final_code:
                missing.append("final_code")
            if not tests:
                missing.append("unit_tests")
            if missing == ["unit_tests"]:
                retry_instruction = (
                    f"Task: {task_description}\nFindings: {json.dumps([x.model_dump() for x in findings])}\n"
                    "The implementation is already complete. Return one valid JSON object containing only a non-empty "
                    "unit_tests string. Write concise pytest tests for the specified task and concrete security fixes only. "
                    "Do not add behavior requirements the task did not request. Verify each assertion against this exact final_code:\n"
                    f"{final_code}"
                )
                retry_budget = 2500 if request.review_depth == "fast" else 3500
            elif missing == ["final_code"]:
                retry_instruction = (
                    "Your previous JSON included tests but omitted final_code. Return one valid JSON object "
                    "containing only a non-empty final_code string. Make the implementation satisfy these tests "
                    "and the task, and address the valid findings:\n"
                    f"Tests:\n{tests}"
                )
                retry_budget = 12000 if request.review_depth == "fast" else 24000
            else:
                retry_instruction = (
                    "Your previous response was incomplete or invalid. Return one valid JSON object with non-empty "
                    "final_code and unit_tests strings. Keep the implementation and tests concise, cover the stated "
                    "task and concrete security fixes only, and verify every assertion against final_code. "
                    "Escape newlines and quotes; do not use markdown fences."
                )
                retry_budget = 12000 if request.review_depth == "fast" else 24000
            retry_messages = (
                [refine_messages[0], {"role": "user", "content": retry_instruction}]
                if missing == ["unit_tests"]
                else refine_messages + [{"role": "user", "content": retry_instruction}]
            )
            refine_raw, retry_tokens = await _gemini_refiner_chat(client, refiner_model, retry_messages, max_tokens=retry_budget, required_fields=tuple(missing))
            refine_tokens += retry_tokens
        if not final_code or not tests:
            missing_fields = ", ".join(field for field, value in (("final_code", final_code), ("unit_tests", tests)) if not value)
            raise RuntimeError(f"Refiner yanıtı eksik kaldı ({missing_fields}). Daha küçük bir Python dosyasıyla yeniden deneyin veya görev açıklamasını kısaltın.")
        if request.language == "Python":
            for filename, source in (("final_code", final_code), ("unit_tests", tests)):
                try:
                    ast.parse(source, filename=filename)
                except SyntaxError as exc:
                    raise RuntimeError(
                        f"Refiner {filename} içinde geçersiz Python sözdizimi üretti "
                        f"(satır {exc.lineno or '?'}: {exc.msg}); otomatik düzeltme denemeleri başarısız oldu."
                    ) from exc
        stages.append({"id": "refining", "model": refiner_model, "elapsed_ms": round((time.perf_counter() - t) * 1000), "tokens": refine_tokens, "output": {"preview": final_code[:1000], "test_preview": tests[:700]}})
        if progress_callback:
            progress_callback(stages[-1])

    return {
        "session_id": str(uuid4()), "prompt": task_description, "analysis_mode": request.analysis_mode, "review_depth": request.review_depth, "response_language": request.response_language, "language": request.language, "source_reference": request.source_reference, "mode": "live", "routing": routing,
        "draft_code": draft, "findings": [x.model_dump() for x in findings], "initial_score": initial_score,
        "final_code": final_code, "tests": tests, "unit_tests": tests, "final_score": max(0, min(100, int(refined.get("score", 90)))),
        "stages": stages, "created_at": datetime.now(timezone.utc).isoformat(), "elapsed_ms": round((time.perf_counter() - started) * 1000),
    }


async def stream_analysis(request: AnalyzeRequest) -> AsyncIterator[dict[str, Any]]:
    session_id = str(uuid4())
    if not os.getenv("NVIDIA_API_KEY", "").strip():
        yield {"event": "error", "data": {"message": "NVIDIA_API_KEY is not configured; no analysis was run."}}
        return

    queue: asyncio.Queue = asyncio.Queue()
    task = asyncio.create_task(live_pipeline(request, queue.put_nowait))
    yield {"event": "mode", "data": {"mode": "live", "session_id": session_id}}
    try:
        while not task.done() or not queue.empty():
            try:
                stage = await asyncio.wait_for(queue.get(), timeout=0.1)
                yield {"event": "stage", "data": {"status": "completed", **stage}}
            except asyncio.TimeoutError:
                continue
        result = task.result()
        result["session_id"] = session_id
        yield {"event": "completed", "data": result}
    except asyncio.CancelledError:
        task.cancel()
        raise
    except Exception as exc:
        if isinstance(exc, httpx.HTTPStatusError):
            response_text = exc.response.text.strip().replace("\n", " ")[:400]
            detail = f"NVIDIA NIM HTTP {exc.response.status_code}: {response_text or exc.response.reason_phrase}"
        elif isinstance(exc, httpx.TimeoutException):
            detail = f"NVIDIA NIM request timed out ({type(exc).__name__}) after {int(NIM_READ_TIMEOUT_SECONDS)} seconds."
        else:
            detail = str(exc).strip() or type(exc).__name__
        yield {"event": "error", "data": {"message": detail[:600]}}
