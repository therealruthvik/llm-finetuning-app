-- ============================================================
-- LLM Fine-Tuning Platform — Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- DATASETS
-- Stores uploaded training data metadata
-- ============================================================
CREATE TABLE IF NOT EXISTS datasets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    filename        TEXT NOT NULL,
    storage_path    TEXT NOT NULL,       -- Supabase Storage path
    file_size_bytes BIGINT,
    row_count       INTEGER,
    format          TEXT DEFAULT 'json', -- json | csv
    status          TEXT DEFAULT 'uploaded' CHECK (status IN ('uploading', 'uploaded', 'invalid')),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRAINING JOBS
-- One row per fine-tuning run
-- ============================================================
CREATE TABLE IF NOT EXISTS jobs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    dataset_id      UUID REFERENCES datasets(id) ON DELETE SET NULL,

    -- Training config
    base_model      TEXT NOT NULL DEFAULT 'unsloth/Llama-3.2-3B-Instruct',
    epochs          INTEGER NOT NULL DEFAULT 1 CHECK (epochs BETWEEN 1 AND 10),
    lora_r          INTEGER NOT NULL DEFAULT 16 CHECK (lora_r IN (8, 16, 32, 64)),
    learning_rate   FLOAT NOT NULL DEFAULT 0.0002,
    batch_size      INTEGER NOT NULL DEFAULT 2,
    max_seq_len     INTEGER NOT NULL DEFAULT 2048,

    -- HuggingFace output
    hf_token        TEXT,               -- encrypted in prod — use Vault
    hf_username     TEXT NOT NULL,
    hf_repo_name    TEXT NOT NULL,
    hf_repo_url     TEXT,               -- filled after push

    -- Job lifecycle
    status          TEXT DEFAULT 'queued' CHECK (
                        status IN ('queued', 'running', 'completed', 'failed', 'cancelled')
                    ),
    modal_call_id   TEXT,               -- Modal function call ID for tracking
    error_message   TEXT,
    final_loss      FLOAT,
    training_time_s INTEGER,            -- seconds

    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ
);

-- ============================================================
-- JOB LOGS
-- Per-step training logs (loss, step, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS job_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    step        INTEGER,
    loss        FLOAT,
    log_line    TEXT,
    logged_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USER PROFILES
-- Extended info beyond Supabase Auth
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name    TEXT,
    hf_username     TEXT,               -- default HF username
    jobs_count      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, display_name)
    VALUES (NEW.id, NEW.email);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- Users can only see their own data
-- ============================================================
ALTER TABLE datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Datasets: owner only
CREATE POLICY "datasets_owner" ON datasets
    FOR ALL USING (auth.uid() = user_id);

-- Jobs: owner only
CREATE POLICY "jobs_owner" ON jobs
    FOR ALL USING (auth.uid() = user_id);

-- Job logs: owner via job
CREATE POLICY "job_logs_owner" ON job_logs
    FOR ALL USING (
        EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_logs.job_id AND jobs.user_id = auth.uid())
    );

-- Profiles: owner only
CREATE POLICY "profiles_owner" ON profiles
    FOR ALL USING (auth.uid() = id);

-- Service role bypass (for backend API)
CREATE POLICY "service_role_all_datasets" ON datasets
    FOR ALL TO service_role USING (true);

CREATE POLICY "service_role_all_jobs" ON jobs
    FOR ALL TO service_role USING (true);

CREATE POLICY "service_role_all_logs" ON job_logs
    FOR ALL TO service_role USING (true);

-- ============================================================
-- STORAGE BUCKET
-- Run separately in Supabase Storage UI or via API
-- ============================================================
-- Create bucket named 'datasets' (private)
-- Insert via Supabase dashboard or:
-- SELECT storage.create_bucket('datasets', '{"public": false}');

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_datasets_user_id ON datasets(user_id);
CREATE INDEX idx_job_logs_job_id ON job_logs(job_id);
CREATE INDEX idx_job_logs_step ON job_logs(job_id, step);
