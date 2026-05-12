from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime
from enum import Enum
import uuid


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class DatasetStatus(str, Enum):
    UPLOADING = "uploading"
    UPLOADED = "uploaded"
    INVALID = "invalid"


# ── Available base models ──────────────────────────────────────
AVAILABLE_MODELS = [
    "unsloth/Llama-3.2-3B-Instruct",
    "unsloth/Llama-3.2-1B-Instruct",
    "unsloth/mistral-7b-instruct-v0.3",
    "unsloth/gemma-2-2b-it",
    "unsloth/Phi-3.5-mini-instruct",
]


# ── Request models ─────────────────────────────────────────────
class CreateJobRequest(BaseModel):
    dataset_id: str
    base_model: str = "unsloth/Llama-3.2-3B-Instruct"
    epochs: int = Field(default=1, ge=1, le=5)
    lora_r: int = Field(default=16)
    learning_rate: float = Field(default=2e-4, gt=0, lt=1)
    batch_size: int = Field(default=2, ge=1, le=8)
    max_seq_len: int = Field(default=2048, ge=512, le=4096)
    hf_token: str
    hf_username: str
    hf_repo_name: str

    @validator("lora_r")
    def validate_lora_r(cls, v):
        if v not in [8, 16, 32, 64]:
            raise ValueError("lora_r must be 8, 16, 32, or 64")
        return v

    @validator("base_model")
    def validate_model(cls, v):
        if v not in AVAILABLE_MODELS:
            raise ValueError(f"model must be one of {AVAILABLE_MODELS}")
        return v


class UpdateJobStatusRequest(BaseModel):
    status: JobStatus
    error_message: Optional[str] = None
    final_loss: Optional[float] = None
    training_time_s: Optional[int] = None
    hf_repo_url: Optional[str] = None


class AddJobLogRequest(BaseModel):
    step: Optional[int] = None
    loss: Optional[float] = None
    log_line: Optional[str] = None


# ── Response models ────────────────────────────────────────────
class DatasetResponse(BaseModel):
    id: str
    filename: str
    file_size_bytes: Optional[int]
    row_count: Optional[int]
    format: str
    status: str
    created_at: datetime


class JobResponse(BaseModel):
    id: str
    dataset_id: Optional[str]
    base_model: str
    epochs: int
    lora_r: int
    learning_rate: float
    hf_username: str
    hf_repo_name: str
    hf_repo_url: Optional[str]
    status: str
    error_message: Optional[str]
    final_loss: Optional[float]
    training_time_s: Optional[int]
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]


class JobLogResponse(BaseModel):
    step: Optional[int]
    loss: Optional[float]
    log_line: Optional[str]
    logged_at: datetime


class JobDetailResponse(JobResponse):
    logs: List[JobLogResponse] = []
