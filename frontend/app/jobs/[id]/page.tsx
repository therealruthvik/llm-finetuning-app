"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { api, JobDetail, supabase } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import Link from "next/link";

const STATUS_COLORS: Record<string, string> = {
  queued: "text-yellow-600 dark:text-yellow-400",
  running: "text-blue-600 dark:text-blue-400",
  completed: "text-green-600 dark:text-green-400",
  failed: "text-red-600 dark:text-red-400",
  cancelled: "text-slate-400 dark:text-gray-500",
};
const STATUS_BG: Record<string, string> = {
  queued: "bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/30",
  running: "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30",
  completed: "bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30",
  failed: "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30",
  cancelled: "bg-slate-50 dark:bg-gray-800/50 border-slate-200 dark:border-gray-700",
};
const STATUS_ICONS: Record<string, string> = {
  queued: "⏳", running: "⚡", completed: "✅", failed: "❌", cancelled: "🚫",
};

export default function JobDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { theme, toggle } = useTheme();
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
    if (!job || !["queued","running"].includes(job.status)) return;
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
        <div className="flex items-center gap-3 text-slate-500 dark:text-gray-400">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          Loading…
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-gray-950 flex items-center justify-center transition-colors">
        <div className="text-center">
          <div className="text-slate-400 dark:text-gray-400 mb-3 text-4xl">🔍</div>
          <div className="text-slate-600 dark:text-gray-400 mb-2">Job not found</div>
          <Link href="/dashboard" className="text-indigo-600 dark:text-indigo-400 text-sm hover:underline">← Dashboard</Link>
        </div>
      </div>
    );
  }

  const isActive = ["queued","running"].includes(job.status);
  const lossData = job.logs.filter((l) => l.loss != null && l.step != null);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-gray-950 text-slate-900 dark:text-white transition-colors">
      <nav className="bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-slate-400 dark:text-gray-400 hover:text-slate-700 dark:hover:text-white text-sm transition-colors">
            ← Dashboard
          </Link>
          <span className="text-slate-900 dark:text-white font-semibold">Job Details</span>
        </div>
        <button
          onClick={toggle}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-gray-700 text-sm hover:border-indigo-400 transition-all"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Header card */}
        <div className={`border rounded-2xl p-6 shadow-sm ${STATUS_BG[job.status] ?? "bg-white dark:bg-gray-900 border-slate-200 dark:border-gray-800"}`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <span className="text-2xl">{STATUS_ICONS[job.status]}</span>
                <h1 className="text-xl font-bold">{job.hf_username}/{job.hf_repo_name}</h1>
              </div>
              <div className={`text-sm font-semibold ${STATUS_COLORS[job.status]}`}>
                {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                {isActive && (
                  <span className="ml-2 text-xs font-normal text-slate-400 dark:text-gray-500">
                    — refreshing every 5s
                    <span className="inline-block ml-1 w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                  </span>
                )}
              </div>
            </div>
            {job.hf_repo_url && (
              <a
                href={job.hf_repo_url}
                target="_blank"
                className="bg-orange-500/10 border border-orange-400/30 text-orange-600 dark:text-orange-400 hover:bg-orange-500/20 text-sm font-medium px-4 py-2 rounded-lg transition-colors shrink-0"
              >
                View on HuggingFace →
              </a>
            )}
          </div>
          {job.error_message && (
            <div className="mt-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-4 py-3 text-red-600 dark:text-red-400 text-sm font-mono">
              {job.error_message}
            </div>
          )}
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Base Model", value: job.base_model.split("/").pop() },
            { label: "Epochs", value: job.epochs },
            { label: "LoRA r", value: job.lora_r },
            { label: "Learning Rate", value: job.learning_rate },
            { label: "Final Loss", value: job.final_loss?.toFixed(4) ?? "—" },
            {
              label: "Training Time",
              value: job.training_time_s
                ? `${Math.floor(job.training_time_s / 60)}m ${job.training_time_s % 60}s`
                : "—",
            },
            { label: "Created", value: new Date(job.created_at).toLocaleString() },
            { label: "Status", value: job.status },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl px-3.5 py-3 shadow-sm">
              <div className="text-xs text-slate-400 dark:text-gray-500 mb-0.5">{label}</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{String(value)}</div>
            </div>
          ))}
        </div>

        {/* Loss curve */}
        {lossData.length > 1 && (
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-4">
              Loss Curve
            </h3>
            <div className="flex items-end gap-0.5 h-24">
              {lossData.map((l, i) => {
                const maxLoss = Math.max(...lossData.map((d) => d.loss!));
                const minLoss = Math.min(...lossData.map((d) => d.loss!));
                const range = maxLoss - minLoss || 1;
                const height = Math.max(4, (1 - (l.loss! - minLoss) / range) * 100);
                return (
                  <div
                    key={i}
                    title={`Step ${l.step}: ${l.loss?.toFixed(4)}`}
                    className="flex-1 bg-indigo-500 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
                    style={{ height: `${height}%` }}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-slate-400 dark:text-gray-600 mt-2">
              <span>Step {lossData[0].step}</span>
              <span>↓ lower is better</span>
              <span>Step {lossData[lossData.length - 1].step}</span>
            </div>
          </div>
        )}

        {/* Logs */}
        <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">
              Training Logs
            </h3>
            <span className="text-xs text-slate-400 dark:text-gray-600">{job.logs.length} entries</span>
          </div>
          <div className="h-72 overflow-y-auto p-4 font-mono text-xs space-y-1.5 bg-slate-50 dark:bg-gray-950/50">
            {job.logs.length === 0 ? (
              <div className="text-slate-400 dark:text-gray-600">
                {isActive ? "Waiting for logs…" : "No logs available"}
              </div>
            ) : (
              job.logs.map((log, i) => (
                <div key={i} className="flex gap-3">
                  <span className="text-slate-400 dark:text-gray-600 shrink-0">
                    {new Date(log.logged_at).toLocaleTimeString()}
                  </span>
                  <span className={log.loss != null ? "text-green-600 dark:text-green-400" : "text-slate-700 dark:text-gray-300"}>
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
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
          >
            + New Job
          </Link>
          {isActive && (
            <button
              onClick={async () => {
                await api.jobs.cancel(job.id);
                setJob({ ...job, status: "cancelled" });
              }}
              className="border border-red-300 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
            >
              Cancel Job
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
