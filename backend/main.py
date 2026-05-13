import os
import uuid
import json
import httpx
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Depends, Header, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import modal

from database import get_db
from models import (
    CreateJobRequest, UpdateJobStatusRequest, AddJobLogRequest,
    JobResponse, JobDetailResponse, DatasetResponse,
    AVAILABLE_MODELS
)

app = FastAPI(title="LLM Fine-Tuning Platform API", version="1.0.0")

# CORS — allow frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_origin_regex=r"https://project-1gj79-.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()

SUPABASE_JWT_SECRET = os.environ["SUPABASE_JWT_SECRET"]
MODAL_TOKEN_ID = os.environ.get("MODAL_TOKEN_ID", "")
MODAL_TOKEN_SECRET = os.environ.get("MODAL_TOKEN_SECRET", "")


# ── Auth ───────────────────────────────────────────────────────
def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Verify Supabase JWT and return user payload."""
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256", "RS256"],
            options={"verify_aud": False}
        )
        return payload
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


def get_user_id(user: dict = Depends(get_current_user)) -> str:
    return user["sub"]


# ── Internal auth (Modal → Backend) ───────────────────────────
INTERNAL_SECRET = os.environ.get("INTERNAL_SECRET", "change-me-in-prod")

def verify_internal(x_internal_secret: str = Header(None)):
    if x_internal_secret != INTERNAL_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")


# ── Health ─────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}


# ── Models ─────────────────────────────────────────────────────
@app.get("/models")
def list_models():
    """Return available base models for fine-tuning."""
    return {"models": AVAILABLE_MODELS}


# ── Datasets ───────────────────────────────────────────────────
@app.post("/datasets", response_model=DatasetResponse)
async def upload_dataset(
    file: UploadFile = File(...),
    user_id: str = Depends(get_user_id),
):
    """Upload a JSON/CSV dataset file to Supabase Storage."""
    db = get_db()

    # Validate file type
    allowed = ["application/json", "text/csv", "text/plain"]
    if file.content_type not in allowed:
        raise HTTPException(400, "Only JSON and CSV files allowed")

    # Validate file size (max 50MB)
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 50MB)")

    # Determine format and count rows
    fmt = "csv" if file.content_type == "text/csv" else "json"
    row_count = None
    try:
        if fmt == "json":
            data = json.loads(content)
            row_count = len(data) if isinstance(data, list) else None
        else:
            lines = content.decode().strip().split("\n")
            row_count = len(lines) - 1  # minus header
    except Exception:
        pass

    # Upload to Supabase Storage
    storage_path = f"{user_id}/{uuid.uuid4()}/{file.filename}"
    db.storage.from_("datasets").upload(storage_path, content)

    # Insert DB record
    record = {
        "user_id": user_id,
        "filename": file.filename,
        "storage_path": storage_path,
        "file_size_bytes": len(content),
        "row_count": row_count,
        "format": fmt,
        "status": "uploaded",
    }
    result = db.table("datasets").insert(record).execute()
    return result.data[0]


@app.get("/datasets", response_model=List[DatasetResponse])
def list_datasets(user_id: str = Depends(get_user_id)):
    db = get_db()
    result = db.table("datasets").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return result.data


@app.delete("/datasets/{dataset_id}")
def delete_dataset(dataset_id: str, user_id: str = Depends(get_user_id)):
    db = get_db()
    ds = db.table("datasets").select("*").eq("id", dataset_id).eq("user_id", user_id).execute()
    if not ds.data:
        raise HTTPException(404, "Dataset not found")
    # Delete from storage
    db.storage.from_("datasets").remove([ds.data[0]["storage_path"]])
    db.table("datasets").delete().eq("id", dataset_id).execute()
    return {"deleted": True}


# ── Jobs ───────────────────────────────────────────────────────
@app.post("/jobs", response_model=JobResponse)
def create_job(req: CreateJobRequest, user_id: str = Depends(get_user_id)):
    """Create a fine-tuning job and trigger Modal training."""
    db = get_db()

    # Verify dataset belongs to user
    ds = db.table("datasets").select("*").eq("id", req.dataset_id).eq("user_id", user_id).execute()
    if not ds.data:
        raise HTTPException(404, "Dataset not found")

    # Get dataset download URL (signed, 1 hour)
    signed = db.storage.from_("datasets").create_signed_url(ds.data[0]["storage_path"], 3600)
    dataset_url = signed["signedURL"]

    # Create job record
    job_record = {
        "user_id": user_id,
        "dataset_id": req.dataset_id,
        "base_model": req.base_model,
        "epochs": req.epochs,
        "lora_r": req.lora_r,
        "learning_rate": req.learning_rate,
        "batch_size": req.batch_size,
        "max_seq_len": req.max_seq_len,
        "hf_token": req.hf_token,  # TODO: encrypt at rest
        "hf_username": req.hf_username,
        "hf_repo_name": req.hf_repo_name,
        "status": "queued",
    }
    result = db.table("jobs").insert(job_record).execute()
    job = result.data[0]
    job_id = job["id"]

    # Trigger Modal training (fire and forget)
    try:
        _trigger_modal_training(job_id, req, dataset_url)
    except Exception as e:
        db.table("jobs").update({"status": "failed", "error_message": str(e)}).eq("id", job_id).execute()
        raise HTTPException(500, f"Failed to trigger training: {e}")

    return job


@app.get("/jobs", response_model=List[JobResponse])
def list_jobs(user_id: str = Depends(get_user_id)):
    db = get_db()
    result = db.table("jobs").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return result.data


@app.get("/jobs/{job_id}", response_model=JobDetailResponse)
def get_job(job_id: str, user_id: str = Depends(get_user_id)):
    db = get_db()
    job = db.table("jobs").select("*").eq("id", job_id).eq("user_id", user_id).execute()
    if not job.data:
        raise HTTPException(404, "Job not found")
    logs = db.table("job_logs").select("*").eq("job_id", job_id).order("step").execute()
    return {**job.data[0], "logs": logs.data}


@app.delete("/jobs/{job_id}")
def cancel_job(job_id: str, user_id: str = Depends(get_user_id)):
    db = get_db()
    job = db.table("jobs").select("*").eq("id", job_id).eq("user_id", user_id).execute()
    if not job.data:
        raise HTTPException(404, "Job not found")
    if job.data[0]["status"] not in ["queued", "running"]:
        raise HTTPException(400, "Job already finished")
    db.table("jobs").update({"status": "cancelled"}).eq("id", job_id).execute()
    return {"cancelled": True}


# ── Internal endpoints (called by Modal) ───────────────────────
@app.patch("/internal/jobs/{job_id}/status")
def update_job_status(
    job_id: str,
    req: UpdateJobStatusRequest,
    _: None = Depends(verify_internal)
):
    """Modal calls this to report job progress."""
    db = get_db()
    update = {"status": req.status.value}
    if req.error_message:
        update["error_message"] = req.error_message
    if req.final_loss is not None:
        update["final_loss"] = req.final_loss
    if req.training_time_s is not None:
        update["training_time_s"] = req.training_time_s
    if req.hf_repo_url:
        update["hf_repo_url"] = req.hf_repo_url
    if req.status.value == "running":
        update["started_at"] = "NOW()"
    if req.status.value in ["completed", "failed", "cancelled"]:
        update["completed_at"] = "NOW()"
    db.table("jobs").update(update).eq("id", job_id).execute()
    return {"updated": True}


@app.post("/internal/jobs/{job_id}/logs")
def add_job_log(
    job_id: str,
    req: AddJobLogRequest,
    _: None = Depends(verify_internal)
):
    """Modal calls this to stream training logs."""
    db = get_db()
    db.table("job_logs").insert({
        "job_id": job_id,
        "step": req.step,
        "loss": req.loss,
        "log_line": req.log_line,
    }).execute()
    return {"logged": True}


# ── Modal trigger ──────────────────────────────────────────────
def _trigger_modal_training(job_id: str, req: CreateJobRequest, dataset_url: str):
    """
    Trigger Modal training function via Modal's Python client.
    Modal function defined in training/modal_app.py.
    """
    import subprocess, sys

    # Use Modal CLI to spawn training — async, non-blocking
    # In production: use modal.Function.lookup() + .spawn()
    backend_url = os.environ.get("BACKEND_URL", "http://localhost:8000")

    payload = {
        "job_id": job_id,
        "dataset_url": dataset_url,
        "base_model": req.base_model,
        "epochs": req.epochs,
        "lora_r": req.lora_r,
        "learning_rate": req.learning_rate,
        "batch_size": req.batch_size,
        "max_seq_len": req.max_seq_len,
        "hf_token": req.hf_token,
        "hf_username": req.hf_username,
        "hf_repo_name": req.hf_repo_name,
        "backend_url": backend_url,
        "internal_secret": INTERNAL_SECRET,
    }

    # Call Modal via HTTP (Modal webhook endpoint)
    modal_webhook_url = os.environ.get("MODAL_WEBHOOK_URL")
    if modal_webhook_url:
        response = httpx.post(modal_webhook_url, json=payload, timeout=30)
        response.raise_for_status()
    else:
        # Fallback: spawn via Modal Python SDK
        try:
            from modal import Function
            train_fn = Function.lookup("llm-finetune-platform", "train_model")
            train_fn.spawn(**payload)
        except Exception as e:
            raise RuntimeError(f"Modal not configured. Set MODAL_WEBHOOK_URL. Error: {e}")
