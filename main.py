import asyncio
import ast
import base64
import hashlib
import ipaddress
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import quote, urlsplit

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from pipeline import CODER_MODEL, CRITIC_MODEL, FAST_REFINER_MODEL, REFINER_MODEL, ROUTER_MODEL, stream_analysis
from presets import PRESETS
from schemas import AnalyzeRequest, RunTestsRequest

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")
HISTORY: deque[dict] = deque(maxlen=40)
GITHUB_API = "https://api.github.com"
GITHUB_SOURCE_EXTENSIONS = {".py"}
GITHUB_MAX_FILE_BYTES = 60_000
GITHUB_MAX_FILES = 300
TEST_ENV_ROOT = ROOT / "tmp" / "test-envs"
TEST_REQUIREMENT_ALIASES = {
    "cv2": "opencv-python-headless",
    "PIL": "Pillow",
    "sklearn": "scikit-learn",
    "yaml": "PyYAML",
    "dotenv": "python-dotenv",
    "bs4": "beautifulsoup4",
    "Crypto": "pycryptodome",
    "dateutil": "python-dateutil",
    "serial": "pyserial",
    "cv": "opencv-python-headless",
}
TEST_PROFILE_REQUIREMENTS = {
    "basic": ["numpy", "requests", "Pillow", "httpx"],
    "vision": ["mediapipe==0.10.21", "numpy"],
    "desktop": ["pyautogui", "pycaw", "comtypes"],
    "data": ["numpy", "pandas", "scipy", "matplotlib", "scikit-learn"],
    "web": ["fastapi", "httpx", "pydantic", "requests"],
    "custom": [],
}
TEST_LOCAL_MODULES = {"solution", "test_solution", "presentation"}
TEST_MAX_REQUIREMENTS = 30
TEST_INSTALL_TIMEOUT_SECONDS = 180
TEST_EXEC_TIMEOUT_SECONDS = 90
_TEST_ENV_LOCKS: dict[str, threading.Lock] = {}
_TEST_ENV_LOCKS_GUARD = threading.Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="DevArena", description="Multi-agent code generation, security review, and refinement cockpit", version="1.0.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


@app.middleware("http")
async def restrict_api_to_local_clients(request, call_next):
    """Keep unauthenticated API endpoints and the code runner off public networks."""
    if request.url.path == "/api" or request.url.path.startswith("/api/"):
        client_host = request.client.host if request.client else ""
        try:
            local_client = ipaddress.ip_address(client_host).is_loopback
        except ValueError:
            local_client = False

        origin = request.headers.get("origin")
        local_origin = True
        if origin:
            parsed_origin = urlsplit(origin)
            origin_host = parsed_origin.hostname or ""
            try:
                local_origin = parsed_origin.scheme in {"http", "https"} and (
                    origin_host.lower() == "localhost" or ipaddress.ip_address(origin_host).is_loopback
                )
            except ValueError:
                local_origin = False

        if not local_client or not local_origin:
            return JSONResponse(
                status_code=403,
                content={"detail": "DevArena API yalnızca bu bilgisayardan kullanılabilir."},
            )
    return await call_next(request)


@app.get("/", include_in_schema=False)
async def index():
    return FileResponse(ROOT / "static" / "index.html")


@app.get("/api/health")
async def health():
    return {"status": "ok", "api_key_configured": bool(os.getenv("NVIDIA_API_KEY", "").strip()), "gemini_key_configured": bool(os.getenv("GEMINI_API_KEYS", "").strip() or os.getenv("GEMINI_API_KEY", "").strip()), "base_url": os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"), "models": {"router": ROUTER_MODEL, "coder": CODER_MODEL, "critic": CRITIC_MODEL, "refiner_fast": FAST_REFINER_MODEL, "refiner_deep": REFINER_MODEL}, "history_sessions": len(HISTORY)}


@app.get("/api/presets")
async def presets():
    scenarios = []
    for preset in PRESETS:
        scenario = dict(preset)
        source_file = scenario.pop("source_file", None)
        if source_file:
            scenario["code"] = (ROOT / "examples" / source_file).read_text(encoding="utf-8")
        scenarios.append(scenario)
    return scenarios


def _parse_public_github_url(repository: str) -> tuple[str, str]:
    parsed = urlsplit(repository.strip())
    if parsed.scheme != "https" or parsed.netloc.lower() != "github.com" or parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="Herkese açık bir https://github.com/kullanici/depo bağlantısı girin.")
    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Depo bağlantısı kullanıcı/depo biçiminde olmalı; alt klasör bağlantısı kullanmayın.")
    owner, repo = parts
    if repo.endswith(".git"):
        repo = repo[:-4]
    valid_name = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")
    if not valid_name.fullmatch(owner) or not valid_name.fullmatch(repo) or owner in {".", ".."} or repo in {".", ".."}:
        raise HTTPException(status_code=400, detail="GitHub kullanıcı veya depo adı geçersiz.")
    return owner, repo


async def _github_json(url: str) -> dict:
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "DevArena-Public-Repo-Reader", "X-GitHub-Api-Version": "2022-11-28"}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=5.0), follow_redirects=False) as client:
            response = await client.get(url, headers=headers)
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="GitHub yanıt vermedi; biraz sonra tekrar deneyin.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="GitHub bağlantısı kurulamadı.") from exc
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="Depo veya dosya bulunamadı. Depo herkese açık mı kontrol edin.")
    if response.status_code == 403:
        raise HTTPException(status_code=429, detail="GitHub istek sınırına ulaşıldı. Bir süre sonra tekrar deneyin.")
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"GitHub isteği başarısız oldu (HTTP {response.status_code}).")
    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="GitHub beklenmeyen bir yanıt döndürdü.") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="GitHub yanıtı okunamadı.")
    return data


async def _github_repo_tree(repository: str) -> tuple[str, str, list[dict], bool]:
    owner, repo = _parse_public_github_url(repository)
    repo_data = await _github_json(f"{GITHUB_API}/repos/{quote(owner)}/{quote(repo)}")
    branch = repo_data.get("default_branch")
    if not isinstance(branch, str) or not branch:
        raise HTTPException(status_code=502, detail="Depoda varsayılan dal bulunamadı.")
    tree_data = await _github_json(f"{GITHUB_API}/repos/{quote(owner)}/{quote(repo)}/git/trees/{quote(branch, safe='')}?recursive=1")
    tree = tree_data.get("tree", [])
    if not isinstance(tree, list):
        raise HTTPException(status_code=502, detail="Depo dosya listesi okunamadı.")
    ignored_parts = {".git", ".venv", "venv", "node_modules", "dist", "build", "site-packages", "__pycache__"}
    files = []
    for item in tree:
        if not isinstance(item, dict) or item.get("type") != "blob":
            continue
        path = item.get("path")
        size = item.get("size", 0)
        if not isinstance(path, str) or Path(path).suffix.lower() not in GITHUB_SOURCE_EXTENSIONS:
            continue
        if any(part.lower() in ignored_parts for part in path.split("/")) or not isinstance(size, int) or size < 1 or size > GITHUB_MAX_FILE_BYTES:
            continue
        files.append({"path": path, "size": size})
        if len(files) >= GITHUB_MAX_FILES:
            break
    return f"{owner}/{repo}", branch, files, bool(tree_data.get("truncated")) or len(files) >= GITHUB_MAX_FILES


@app.get("/api/github/files")
async def github_files(repository: str = Query(min_length=12, max_length=300)):
    repo_name, branch, files, truncated = await _github_repo_tree(repository)
    return {"repository": repo_name, "branch": branch, "files": files, "truncated": truncated}


@app.get("/api/github/file")
async def github_file(repository: str = Query(min_length=12, max_length=300), path: str = Query(min_length=1, max_length=500), ref: str = Query(min_length=1, max_length=200)):
    repo_name, branch, files, _ = await _github_repo_tree(repository)
    if ref != branch:
        raise HTTPException(status_code=400, detail="Depo dalı değişmiş. Dosya listesini yeniden yükleyin.")
    selected = next((item for item in files if item["path"] == path), None)
    if not selected:
        raise HTTPException(status_code=404, detail="Dosya listede yok veya boyutu bu ilk sürüm için çok büyük.")
    owner, repo = _parse_public_github_url(repository)
    path_url = quote(path, safe="/")
    data = await _github_json(f"{GITHUB_API}/repos/{quote(owner)}/{quote(repo)}/contents/{path_url}?ref={quote(branch, safe='')}")
    if data.get("type") != "file" or data.get("encoding") != "base64" or not isinstance(data.get("content"), str):
        raise HTTPException(status_code=415, detail="Bu dosya metin olarak okunamadı.")
    try:
        raw = base64.b64decode(data["content"], validate=False)
        content = raw.decode("utf-8")
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=415, detail="Dosya UTF-8 metin değil; içe aktarılamadı.") from exc
    if len(raw) > GITHUB_MAX_FILE_BYTES or b"\x00" in raw:
        raise HTTPException(status_code=413, detail="Dosya 60 KB sınırını aşıyor veya ikili dosya.")
    return {"repository": repo_name, "branch": branch, "path": path, "content": content, "size": len(raw)}


@app.get("/api/history")
async def history():
    return list(HISTORY)


@app.post("/api/analyze/stream")
async def analyze_stream(request: AnalyzeRequest):
    async def events():
        try:
            async for item in stream_analysis(request):
                if item["event"] == "completed":
                    HISTORY.appendleft(item["data"])
                yield f"event: {item['event']}\ndata: {json.dumps(item['data'], ensure_ascii=False)}\n\n"
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'message': str(exc)[:240]}, ensure_ascii=False)}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"})


def _python_import_roots(final_code: str, unit_tests: str) -> set[str]:
    imports = set()
    for source_name, source in (("final_code", final_code), ("unit_tests", unit_tests)):
        try:
            tree = ast.parse(source, filename=source_name)
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.update(alias.name.split(".", 1)[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                imports.add(node.module.split(".", 1)[0])
    return imports


def _resolve_test_profile(requested: str, final_code: str, unit_tests: str) -> str:
    if requested != "auto":
        return requested
    imports = _python_import_roots(final_code, unit_tests)
    if "mediapipe" in imports:
        return "vision"
    if imports & {"pyautogui", "pycaw", "comtypes"}:
        return "desktop"
    if imports & {"pandas", "scipy", "matplotlib", "sklearn"}:
        return "data"
    if imports & {"fastapi", "starlette", "pydantic", "httpx"}:
        return "web"
    return "basic"


def _parse_test_requirements(requirements_txt: str, final_code: str, unit_tests: str, profile: str) -> list[str]:
    supplied = []
    for raw_line in requirements_txt.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith(("-", ".", "/", "\\")) or "://" in line or " @ " in line:
            raise ValueError("requirements listesinde yalnızca PyPI paket adı ve sürüm koşulu kullanın (örn. numpy>=1.26).")
        requirement_pattern = r"[A-Za-z0-9][A-Za-z0-9._-]{0,100}(?:\[[A-Za-z0-9._,-]+\])?(?:\s*(?:===|==|~=|!=|<=|>=|<|>)\s*[A-Za-z0-9.*+!_-]+(?:\s*,\s*(?:===|==|~=|!=|<=|>=|<|>)\s*[A-Za-z0-9.*+!_-]+)*)?"
        if not re.fullmatch(requirement_pattern, line):
            raise ValueError(f"Geçersiz bağımlılık satırı: {line[:120]}")
        supplied.append(re.sub(r"\s+", "", line))
    imports = _python_import_roots(final_code, unit_tests)
    stdlib = getattr(sys, "stdlib_module_names", set())
    inferred = [
        TEST_REQUIREMENT_ALIASES.get(module, module)
        for module in sorted(imports)
        if module not in stdlib and module not in TEST_LOCAL_MODULES and module not in {"pytest", "unittest", "typing_extensions"}
    ]
    if "mediapipe" in imports:
        # mediapipe supplies the OpenCV distribution that provides cv2.
        inferred = [item for item in inferred if item.lower() != "opencv-python-headless"]
    if profile == "vision":
        # Keep the legacy mp.solutions API used by common hand-tracking projects.
        inferred = [item for item in inferred if re.split(r"(?:===|==|~=|!=|<=|>=|<|>)", item, maxsplit=1)[0].lower() != "mediapipe"]
    profile_requirements = list(TEST_PROFILE_REQUIREMENTS[profile])
    supplied_names = {
        re.split(r"(?:===|==|~=|!=|<=|>=|<|>)", item, maxsplit=1)[0].lower()
        for item in supplied
    }
    profile_requirements = [
        item for item in profile_requirements
        if re.split(r"(?:===|==|~=|!=|<=|>=|<|>)", item, maxsplit=1)[0].lower() not in supplied_names
    ]
    requirements = [*profile_requirements, *supplied]
    if not supplied and profile != "custom":
        requirements.extend(inferred)
    unique = {}
    for requirement in requirements:
        package = re.split(r"(?:===|==|~=|!=|<=|>=|<|>)", requirement, maxsplit=1)[0]
        unique[package.lower().replace("_", "-")] = requirement
    if len(unique) > TEST_MAX_REQUIREMENTS:
        raise ValueError(f"En fazla {TEST_MAX_REQUIREMENTS} bağımlılık verilebilir.")
    return sorted(unique.values(), key=str.lower)


def _test_environment(requirements: list[str], project_key: str) -> tuple[Path, str | None]:
    fingerprint_input = project_key.strip().casefold() + "\0" + "\n".join(requirements)
    fingerprint = hashlib.sha256(fingerprint_input.encode("utf-8")).hexdigest()[:20]
    env_dir = TEST_ENV_ROOT / fingerprint
    python = env_dir / "Scripts" / "python.exe"
    with _TEST_ENV_LOCKS_GUARD:
        env_lock = _TEST_ENV_LOCKS.setdefault(fingerprint, threading.Lock())
    with env_lock:
        if not python.exists():
            TEST_ENV_ROOT.mkdir(parents=True, exist_ok=True)
            created = subprocess.run(
                [sys.executable, "-m", "venv", str(env_dir)],
                capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60, check=False,
            )
            if created.returncode != 0:
                shutil.rmtree(env_dir, ignore_errors=True)
                return Path(), (created.stdout + created.stderr)[-4000:]
            install_requirements = ["pytest>=8,<9", *requirements]
            installed = subprocess.run(
                [str(python), "-m", "pip", "install", "--disable-pip-version-check", *install_requirements],
                capture_output=True, text=True, encoding="utf-8", errors="replace",
                timeout=TEST_INSTALL_TIMEOUT_SECONDS, check=False,
            )
            if installed.returncode != 0:
                shutil.rmtree(env_dir, ignore_errors=True)
                return Path(), (installed.stdout + installed.stderr)[-6000:]
    return python, None


def _run_python_tests(final_code: str, unit_tests: str, requirements_txt: str = "", project_key: str = "local-project", requested_profile: str = "auto") -> dict:
    started = time.perf_counter()
    profile = _resolve_test_profile(requested_profile, final_code, unit_tests)
    try:
        requirements = _parse_test_requirements(requirements_txt, final_code, unit_tests, profile)
    except ValueError as exc:
        return {"passed": False, "exit_code": None, "timed_out": False, "runner": "pytest", "phase": "dependencies", "elapsed_ms": round((time.perf_counter() - started) * 1000), "output": str(exc)}
    env_python, setup_error = _test_environment(requirements, project_key)
    if setup_error:
        return {"passed": False, "exit_code": None, "timed_out": False, "runner": "pytest", "phase": "dependencies", "profile": profile, "requirements": requirements, "elapsed_ms": round((time.perf_counter() - started) * 1000), "output": "Proje için ayrı Python ortamı hazırlanamadı veya bağımlılık kurulamadı.\n" + setup_error}
    with tempfile.TemporaryDirectory(prefix="devarena-tests-") as temp_dir:
        workdir = Path(temp_dir)
        (workdir / "solution.py").write_text(final_code, encoding="utf-8")
        (workdir / "test_solution.py").write_text(unit_tests, encoding="utf-8")
        safe_env = {
            key: os.environ[key]
            for key in ("PATH", "SystemRoot", "WINDIR", "TEMP", "TMP")
            if os.environ.get(key)
        }
        safe_env.update({"PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1"})
        command = [str(env_python), "-m", "pytest", "-q", "--disable-warnings", "--maxfail=1", str(workdir / "test_solution.py")]
        try:
            completed = subprocess.run(
                command,
                cwd=workdir,
                env=safe_env,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=TEST_EXEC_TIMEOUT_SECONDS,
                check=False,
            )
            output = (completed.stdout + completed.stderr).strip()
            imports = _python_import_roots(final_code, unit_tests)
            if "mp.solutions" in final_code and "mediapipe" in imports and "has no attribute 'solutions'" in output:
                output += "\n\nBu kod eski MediaPipe Solutions API'sini kullanıyor. Görüntü işleme profilini seçin veya mediapipe==0.10.21 kullanın."
            return {
                "passed": completed.returncode == 0,
                "exit_code": completed.returncode,
                "timed_out": False,
                "runner": "pytest",
                "phase": "tests",
                "profile": profile,
                "requirements": requirements,
                "elapsed_ms": round((time.perf_counter() - started) * 1000),
                "output": output[-12000:] or "Pytest completed without output.",
            }
        except subprocess.TimeoutExpired as exc:
            stdout = exc.stdout.decode("utf-8", "replace") if isinstance(exc.stdout, bytes) else (exc.stdout or "")
            stderr = exc.stderr.decode("utf-8", "replace") if isinstance(exc.stderr, bytes) else (exc.stderr or "")
            return {
                "passed": False,
                "exit_code": None,
                "timed_out": True,
                "runner": "pytest",
                "phase": "tests",
                "profile": profile,
                "requirements": requirements,
                "elapsed_ms": round((time.perf_counter() - started) * 1000),
                "output": (stdout + stderr + f"\nTest run exceeded the {TEST_EXEC_TIMEOUT_SECONDS} second limit.")[-12000:],
            }


@app.post("/api/run-tests")
async def run_tests(request: RunTestsRequest):
    return await asyncio.to_thread(_run_python_tests, request.final_code, request.unit_tests, request.requirements_txt, request.project_key, request.profile)
