"""
LLM Fine-Tuning Platform — Modal Training Script
=================================================
Deploy: modal deploy training/modal_app.py
Test:   modal run training/modal_app.py
"""

import modal
import os
import time
import json
import httpx

app = modal.App("llm-finetune-platform")

training_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")          # git required for some deps
    .pip_install(
        "torch==2.3.0",
        "transformers>=4.40.0",
        "datasets>=2.19.0",
        "trl>=0.8.6",
        "peft>=0.10.0",
        "accelerate>=0.30.0",
        "bitsandbytes>=0.43.0",
        "huggingface_hub>=0.23.0",
        "httpx>=0.27.0",
        "xformers",
    )
    .pip_install(
        "unsloth",               # PyPI release — no git needed
    )
)

# FIX: use string "T4" instead of modal.gpu.T4()
GPU_TYPE = "T4"


# ── Utility: report to backend ─────────────────────────────────
class BackendReporter:
    def __init__(self, job_id: str, backend_url: str, internal_secret: str):
        self.job_id = job_id
        self.backend_url = backend_url.rstrip("/")
        self.headers = {"x-internal-secret": internal_secret}

    def update_status(self, status: str, **kwargs):
        try:
            httpx.patch(
                f"{self.backend_url}/internal/jobs/{self.job_id}/status",
                json={"status": status, **kwargs},
                headers=self.headers,
                timeout=10,
            )
        except Exception as e:
            print(f"[reporter] Failed to update status: {e}")

    def add_log(self, step: int = None, loss: float = None, log_line: str = None):
        try:
            httpx.post(
                f"{self.backend_url}/internal/jobs/{self.job_id}/logs",
                json={"step": step, "loss": loss, "log_line": log_line},
                headers=self.headers,
                timeout=10,
            )
        except Exception as e:
            print(f"[reporter] Failed to add log: {e}")


# ── Dataset loader ─────────────────────────────────────────────
def load_dataset_from_url(url: str):
    import csv
    from datasets import Dataset

    response = httpx.get(url, timeout=120, follow_redirects=True)
    response.raise_for_status()
    content = response.content

    try:
        data = json.loads(content)
        if isinstance(data, list):
            return Dataset.from_list(data)
        raise ValueError("JSON must be a list")
    except (json.JSONDecodeError, ValueError):
        lines = content.decode("utf-8").strip().split("\n")
        reader = csv.DictReader(lines)
        return Dataset.from_list(list(reader))


def validate_dataset(dataset):
    required = ["instruction", "output"]
    missing = [c for c in required if c not in dataset.column_names]
    if missing:
        raise ValueError(
            f"Dataset missing columns: {missing}. Got: {dataset.column_names}"
        )
    return dataset


# ── Format prompts ─────────────────────────────────────────────
ALPACA_PROMPT = """Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
{instruction}

### Input:
{input}

### Response:
{output}"""


def format_prompts(examples, tokenizer):
    EOS_TOKEN = tokenizer.eos_token
    instructions = examples["instruction"]
    inputs = examples.get("input", [""] * len(instructions))
    outputs = examples["output"]
    texts = []
    for inst, inp, out in zip(instructions, inputs, outputs):
        text = ALPACA_PROMPT.format(
            instruction=inst,
            input=inp or "",
            output=out
        ) + EOS_TOKEN
        texts.append(text)
    return {"text": texts}


# ── Main training function ─────────────────────────────────────
@app.function(
    image=training_image,
    gpu=GPU_TYPE,           # FIX: string "T4" works in all Modal versions
    timeout=60 * 60 * 3,
    memory=8192,
)
def train_model(
    job_id: str,
    dataset_url: str,
    base_model: str = "unsloth/Llama-3.2-3B-Instruct",
    epochs: int = 1,
    lora_r: int = 16,
    learning_rate: float = 2e-4,
    batch_size: int = 2,
    max_seq_len: int = 2048,
    hf_token: str = "",
    hf_username: str = "",
    hf_repo_name: str = "",
    backend_url: str = "",
    internal_secret: str = "",
):
    import torch
    from unsloth import FastLanguageModel, is_bfloat16_supported
    from trl import SFTTrainer
    from transformers import TrainingArguments, TrainerCallback
    from huggingface_hub import login

    reporter = BackendReporter(job_id, backend_url, internal_secret)
    start_time = time.time()

    print(f"[{job_id}] Training started on {torch.cuda.get_device_name(0)}")

    try:
        reporter.update_status("running")
        reporter.add_log(log_line=f"GPU: {torch.cuda.get_device_name(0)}")

        # Load model
        reporter.add_log(log_line=f"Loading model: {base_model}")
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=base_model,
            max_seq_length=max_seq_len,
            dtype=None,
            load_in_4bit=True,
        )

        # Apply LoRA
        model = FastLanguageModel.get_peft_model(
            model,
            r=lora_r,
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                            "gate_proj", "up_proj", "down_proj"],
            lora_alpha=lora_r,
            lora_dropout=0,
            bias="none",
            use_gradient_checkpointing="unsloth",
            random_state=42,
        )

        total = sum(p.numel() for p in model.parameters())
        trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
        reporter.add_log(log_line=f"LoRA applied. Trainable: {trainable:,} ({100*trainable/total:.2f}%)")

        # Load dataset
        reporter.add_log(log_line="Downloading dataset...")
        raw_dataset = load_dataset_from_url(dataset_url)
        raw_dataset = validate_dataset(raw_dataset)
        reporter.add_log(log_line=f"Dataset loaded: {len(raw_dataset)} examples")

        formatted = raw_dataset.map(
            lambda ex: format_prompts(ex, tokenizer),
            batched=True
        )

        # Training args
        training_args = TrainingArguments(
            output_dir="/tmp/checkpoints",
            num_train_epochs=epochs,
            per_device_train_batch_size=batch_size,
            gradient_accumulation_steps=4,
            optim="adamw_8bit",
            learning_rate=learning_rate,
            weight_decay=0.01,
            warmup_ratio=0.03,
            lr_scheduler_type="linear",
            fp16=not is_bfloat16_supported(),
            bf16=is_bfloat16_supported(),
            logging_steps=10,
            save_steps=100,
            save_total_limit=2,
            seed=42,
            report_to="none",
        )

        # Live log callback
        class LiveLogCallback(TrainerCallback):
            def on_log(self, args, state, control, logs=None, **kwargs):
                if logs and state.global_step % 10 == 0:
                    loss = logs.get("loss")
                    if loss:
                        reporter.add_log(
                            step=state.global_step,
                            loss=loss,
                            log_line=f"step={state.global_step} loss={loss:.4f}"
                        )

        # Train
        reporter.add_log(log_line="Training started...")
        trainer = SFTTrainer(
            model=model,
            tokenizer=tokenizer,
            train_dataset=formatted,
            dataset_text_field="text",
            max_seq_length=max_seq_len,
            dataset_num_proc=2,
            packing=False,
            args=training_args,
            callbacks=[LiveLogCallback()],
        )

        stats = trainer.train()
        final_loss = stats.training_loss
        elapsed = int(time.time() - start_time)
        reporter.add_log(log_line=f"Training done. loss={final_loss:.4f} time={elapsed}s")

        # Push to HuggingFace
        reporter.add_log(log_line=f"Pushing to {hf_username}/{hf_repo_name}...")
        login(token=hf_token)
        repo_id = f"{hf_username}/{hf_repo_name}"
        model.push_to_hub_merged(repo_id, tokenizer, save_method="lora", token=hf_token)
        hf_repo_url = f"https://huggingface.co/{repo_id}"
        reporter.add_log(log_line=f"Pushed: {hf_repo_url}")

        reporter.update_status(
            "completed",
            final_loss=final_loss,
            training_time_s=elapsed,
            hf_repo_url=hf_repo_url,
        )
        print(f"[{job_id}] SUCCESS — {hf_repo_url}")

    except Exception as e:
        elapsed = int(time.time() - start_time)
        error_msg = str(e)
        print(f"[{job_id}] FAILED — {error_msg}")
        reporter.add_log(log_line=f"ERROR: {error_msg}")
        reporter.update_status("failed", error_message=error_msg, training_time_s=elapsed)
        raise


# ── Webhook entrypoint ─────────────────────────────────────────
webhook_image = modal.Image.debian_slim().pip_install("fastapi[standard]", "httpx")

@app.function(image=webhook_image)
@modal.fastapi_endpoint(method="POST")
def training_webhook(payload: dict):
    required = ["job_id", "dataset_url", "hf_token", "hf_username", "hf_repo_name", "backend_url"]
    for field in required:
        if field not in payload:
            return {"error": f"Missing field: {field}"}
    train_model.spawn(**payload)
    return {"queued": True, "job_id": payload["job_id"]}


# ── Local test ─────────────────────────────────────────────────
@app.local_entrypoint()
def main():
    print("Modal app ready.")
    print("Deploy with: modal deploy training/modal_app.py")
    print("After deploy, note the webhook URL for MODAL_WEBHOOK_URL env var.")