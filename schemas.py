from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class AnalyzeRequest(BaseModel):
    analysis_mode: Literal["generate", "audit"] = "generate"
    review_depth: Literal["fast", "deep"] = "fast"
    response_language: Literal["tr", "en"] = "tr"
    prompt: str = Field(default="", max_length=12000)
    code: str | None = Field(default=None, max_length=60000)
    source_reference: str | None = Field(default=None, max_length=1000)
    language: Literal["Python", "TypeScript", "Go", "SQL"] = "Python"

    @model_validator(mode="after")
    def validate_mode_input(self):
        if self.analysis_mode == "generate" and len(self.prompt.strip()) < 8:
            raise ValueError("prompt must be at least 8 characters in generate mode")
        if self.analysis_mode == "audit" and (not self.code or len(self.code.strip()) < 8):
            raise ValueError("code must be at least 8 characters in audit mode")
        return self


class RunTestsRequest(BaseModel):
    final_code: str = Field(min_length=1, max_length=60000)
    unit_tests: str = Field(min_length=1, max_length=60000)
    requirements_txt: str = Field(default="", max_length=8000)
    project_key: str = Field(default="local-project", min_length=1, max_length=300)
    profile: Literal["auto", "basic", "vision", "desktop", "data", "web", "custom"] = "auto"


class Finding(BaseModel):
    severity: Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]
    title: str
    line: int | str
    description: str
    category: str = "Security"


class PipelineResult(BaseModel):
    session_id: str
    prompt: str
    language: str
    response_language: Literal["tr", "en"] = "tr"
    mode: Literal["live", "demo"]
    routing: dict[str, Any]
    draft_code: str
    findings: list[Finding]
    initial_score: int
    final_code: str
    tests: str
    final_score: int
    stages: list[dict[str, Any]]
    created_at: str
