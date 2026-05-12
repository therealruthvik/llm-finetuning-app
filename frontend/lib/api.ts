import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Auth helpers ──────────────────────────────────────────────
export async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function authHeaders() {
  const token = await getAuthToken();
  if (!token) throw new Error("Not authenticated");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// ── Generic fetcher ───────────────────────────────────────────
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "API error");
  }
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────
export interface Dataset {
  id: string;
  filename: string;
  file_size_bytes: number;
  row_count: number;
  format: string;
  status: string;
  created_at: string;
}

export interface Job {
  id: string;
  dataset_id: string;
  base_model: string;
  epochs: number;
  lora_r: number;
  learning_rate: number;
  hf_username: string;
  hf_repo_name: string;
  hf_repo_url?: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  error_message?: string;
  final_loss?: number;
  training_time_s?: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface JobLog {
  step?: number;
  loss?: number;
  log_line?: string;
  logged_at: string;
}

export interface JobDetail extends Job {
  logs: JobLog[];
}

// ── API calls ─────────────────────────────────────────────────
export const api = {
  models: () => fetch(`${API_URL}/models`).then((r) => r.json()),

  datasets: {
    list: () => apiFetch<Dataset[]>("/datasets"),
    delete: (id: string) => apiFetch(`/datasets/${id}`, { method: "DELETE" }),
    upload: async (file: File): Promise<Dataset> => {
      const token = await getAuthToken();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_URL}/datasets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Upload failed");
      }
      return res.json();
    },
  },

  jobs: {
    list: () => apiFetch<Job[]>("/jobs"),
    get: (id: string) => apiFetch<JobDetail>(`/jobs/${id}`),
    create: (payload: {
      dataset_id: string;
      base_model: string;
      epochs: number;
      lora_r: number;
      learning_rate: number;
      batch_size: number;
      max_seq_len: number;
      hf_token: string;
      hf_username: string;
      hf_repo_name: string;
    }) => apiFetch<Job>("/jobs", { method: "POST", body: JSON.stringify(payload) }),
    cancel: (id: string) => apiFetch(`/jobs/${id}`, { method: "DELETE" }),
  },
};
