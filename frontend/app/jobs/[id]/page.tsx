"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { api, JobDetail, supabase } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import Link from "next/link";

function Icon({ d, className = "w-4 h-4" }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-gray-700 hover:border-slate-300 dark:hover:border-gray-600 transition-all"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-slate-500" fill="currentColor" viewBox="0 0 20 20">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      )}
    </button>
  );
}

const STATUS_CONFIG: Record<string, { dot: string; text: string; border: string; label: string }> = {
  queued:    { dot: "bg-amber-400",              text: "text-amber-700 dark:text-amber-400",   border: "border-amber-200 dark:border-amber-500/25",    label: "Queued" },
  running:   { dot: "bg-blue-400 animate-pulse", text: "text-blue-700 dark:text-blue-400",     border: "border-blue-200 dark:border-blue-500/25",      label: "Running" },
  completed: { dot: "bg-emerald-400",            text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-500/25", label: "Completed" },
  failed:    { dot: "bg-red-400",                text: "text-red-700 dark:text-red-400",       border: "border-red-200 dark:border-red-500/25",        label: "Failed" },
  cancelled: { dot: "bg-gray-400",               text: "text-gray-600 dark:text-gray-400",     border: "border-gray-200 dark:border-gray-700",         label: "Cancelled" },
};

export default function JobDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (!data.session) router.push("/"); });
  }, [router]);

  useEffect(() => {
    if (!id) return;
    api.jobs.get(id).then(setJob).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const interval = setInterval(async () => {
      const updated = await api.jobs.get(id).catch(() => job);
      setJob(updated);
    }, 5000);
    return () => clearInterval(interval);
  }, [job, id]);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [job?.logs]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-gray-950 flex items-center justify-center transition-colors">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-400 dark:text-gray-500 text-sm">Loading job…</span>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-gray-950 flex items-center justify-center transition-colors">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-200 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
            <Icon d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-6 h-6 text-slate-400 dark:text-gray-500" />
          </div>
          <div className="text-slate-600 dark:text-gray-400 font-medium mb-2">Job not found</div>
          <Link href="/dashboard" className="text-indigo-600 dark:text-indigo-400 text-sm font-medium hover:underline">← Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.cancelled;
  const isActive = ["queued", "running"].includes(job.status);
  const lossData = job.logs.filter((l) => l.loss != null && l.step != null);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 text-slate-900 dark:text-white transition-colors">
      {/* Nav */}
      <nav className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-slate-200 dark:border-gray-800 h-14 px-6 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard" className="flex items-center gap-1.5 text-slate-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-white text-sm transition-colors shrink-0">
            <Icon d="M15 19l-7-7 7-7" className="w-4 h-4" />
            Dashboard
          </Link>
          <span className="text-slate-300 dark:text-gray-700">/</span>
          <span className="text-sm font-semibold truncate">{job.hf_username}/{job.hf_repo_name}</span>
        </div>
        <ThemeToggle />
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-5">
        {/* Status card */}
        <div className={`bg-white dark:bg-gray-900 border ${cfg.border} rounded-2xl p-5 shadow-sm`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-2">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                <span className={`text-sm font-semibold ${cfg.text}`}>{cfg.label}</span>
                {isActive && <span className="text-xs text-slate-400 dark:text-gray-500">· refreshing every 5s</span>}
              </div>
              <h1 className="text-xl font-bold truncate">{job.hf_username}/{job.hf_repo_name}</h1>
              {job.error_message && (
                <div className="mt-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 rounded-xl px-3.5 py-2.5 text-red-600 dark:text-red-400 text-xs font-mono break-all">
                  {job.error_message}
                </div>
              )}
            </div>
            {job.hf_repo_url && (
              <a
                href={job.hf_repo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 shrink-0 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-300/40 dark:border-orange-500/25 text-orange-600 dark:text-orange-400 text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors"
              >
                View on HuggingFace
                <Icon d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Base Model", value: job.base_model.split("/").pop() },
            { label: "Epochs", value: job.epochs },
            { label: "LoRA rank", value: `r=${job.lora_r}` },
            { label: "Learning Rate", value: job.learning_rate },
            { label: "Final Loss", value: job.final_loss?.toFixed(4) ?? "—" },
            {
              label: "Training Time",
              value: job.training_time_s
                ? `${Math.floor(job.training_time_s / 60)}m ${job.training_time_s % 60}s`
                : "—",
            },
            { label: "Created", value: new Date(job.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) },
            { label: "Status", value: cfg.label },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl px-3.5 py-3 shadow-sm">
              <div className="text-[10px] font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-1">{label}</div>
              <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{String(value)}</div>
            </div>
          ))}
        </div>

        {/* Loss curve */}
        {lossData.length > 1 && (
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm">
            <div className="text-xs font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-4">Loss Curve</div>
            <div className="flex items-end gap-px h-20">
              {lossData.map((l, i) => {
                const maxLoss = Math.max(...lossData.map((d) => d.loss!));
                const minLoss = Math.min(...lossData.map((d) => d.loss!));
                const range = maxLoss - minLoss || 1;
                const pct = Math.max(4, (1 - (l.loss! - minLoss) / range) * 100);
                return (
                  <div
                    key={i}
                    title={`Step ${l.step}: ${l.loss?.toFixed(4)}`}
                    style={{ height: `${pct}%` }}
                    className="flex-1 bg-gradient-to-t from-indigo-600 to-violet-400 rounded-sm opacity-70 hover:opacity-100 transition-opacity min-w-[2px]"
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 dark:text-gray-600 mt-2">
              <span>Step {lossData[0].step}</span>
              <span>↓ lower is better</span>
              <span>Step {lossData[lossData.length - 1].step}</span>
            </div>
          </div>
        )}

        {/* Training logs */}
        <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-100 dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400/70" />
                <div className="w-3 h-3 rounded-full bg-amber-400/70" />
                <div className="w-3 h-3 rounded-full bg-emerald-400/70" />
              </div>
              <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 ml-1">Training Logs</span>
            </div>
            <span className="text-[10px] text-slate-400 dark:text-gray-600">{job.logs.length} entries</span>
          </div>
          <div className="h-72 overflow-y-auto p-4 font-mono text-xs space-y-1.5 bg-slate-950">
            {job.logs.length === 0 ? (
              <div className="text-gray-500">
                {isActive ? "$ Waiting for logs…" : "$ No logs available"}
              </div>
            ) : (
              job.logs.map((log, i) => (
                <div key={i} className="flex gap-3">
                  <span className="text-gray-600 shrink-0">{new Date(log.logged_at).toLocaleTimeString()}</span>
                  <span className={log.loss != null ? "text-emerald-400" : "text-gray-300"}>
                    {log.log_line}
                  </span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Link
            href="/new-job"
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all shadow-md shadow-indigo-500/20"
          >
            <Icon d="M12 4v16m8-8H4" className="w-4 h-4" />
            New Training Job
          </Link>
          {isActive && (
            <button
              onClick={async () => {
                await api.jobs.cancel(job.id);
                setJob({ ...job, status: "cancelled" });
              }}
              className="flex items-center gap-2 border border-red-200 dark:border-red-500/25 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
            >
              Cancel Job
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
