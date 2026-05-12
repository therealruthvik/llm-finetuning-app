"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { api, JobDetail, supabase } from "@/lib/api";
import Link from "next/link";

const STATUS_COLORS: Record<string, string> = {
  queued: "text-yellow-400", running: "text-blue-400",
  completed: "text-green-400", failed: "text-red-400", cancelled: "text-gray-400",
};
const STATUS_ICONS: Record<string, string> = {
  queued: "⏳", running: "⚡", completed: "✅", failed: "❌", cancelled: "🚫",
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
    if (!job || !["queued","running"].includes(job.status)) return;
    const interval = setInterval(async () => {
      const updated = await api.jobs.get(id).catch(() => job);
      setJob(updated);
    }, 5000);
    return () => clearInterval(interval);
  }, [job, id]);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [job?.logs]);

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-gray-400">Loading...</div></div>;
  if (!job) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="text-center"><div className="text-gray-400 mb-2">Job not found</div><Link href="/dashboard" className="text-indigo-400 text-sm">← Dashboard</Link></div></div>;

  const isActive = ["queued","running"].includes(job.status);
  const lossData = job.logs.filter((l) => l.loss != null && l.step != null);

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-gray-800 px-6 py-3 flex items-center gap-4">
        <Link href="/dashboard" className="text-gray-400 hover:text-white text-sm">← Dashboard</Link>
        <span className="text-white font-medium">Job Details</span>
      </nav>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">{STATUS_ICONS[job.status]}</span>
                <h1 className="text-xl font-bold">{job.hf_username}/{job.hf_repo_name}</h1>
              </div>
              <div className={`text-sm font-medium ${STATUS_COLORS[job.status]}`}>
                {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                {isActive && " — refreshing every 5s..."}
              </div>
            </div>
            {job.hf_repo_url && (
              <a href={job.hf_repo_url} target="_blank"
                className="bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500/20 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                View on HuggingFace →
              </a>
            )}
          </div>
          {job.error_message && (
            <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm font-mono">{job.error_message}</div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Base Model", value: job.base_model.split("/").pop() },
            { label: "Epochs", value: job.epochs },
            { label: "LoRA r", value: job.lora_r },
            { label: "Learning Rate", value: job.learning_rate },
            { label: "Final Loss", value: job.final_loss?.toFixed(4) ?? "—" },
            { label: "Training Time", value: job.training_time_s ? `${Math.floor(job.training_time_s/60)}m ${job.training_time_s%60}s` : "—" },
            { label: "Created", value: new Date(job.created_at).toLocaleString() },
            { label: "Status", value: job.status },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
              <div className="text-xs text-gray-500 mb-0.5">{label}</div>
              <div className="text-sm font-medium text-white truncate">{String(value)}</div>
            </div>
          ))}
        </div>

        {lossData.length > 1 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">Loss Curve</h3>
            <div className="flex items-end gap-0.5 h-24">
              {lossData.map((l, i) => {
                const maxLoss = Math.max(...lossData.map((d) => d.loss!));
                const minLoss = Math.min(...lossData.map((d) => d.loss!));
                const range = maxLoss - minLoss || 1;
                const height = Math.max(4, (1 - (l.loss! - minLoss) / range) * 100);
                return <div key={i} title={`Step ${l.step}: ${l.loss?.toFixed(4)}`}
                  className="flex-1 bg-indigo-500 rounded-sm opacity-80 hover:opacity-100 transition-opacity"
                  style={{ height: `${height}%` }} />;
              })}
            </div>
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>Step {lossData[0].step}</span>
              <span>Step {lossData[lossData.length-1].step}</span>
            </div>
          </div>
        )}

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-400">Training Logs</h3>
            <span className="text-xs text-gray-600">{job.logs.length} entries</span>
          </div>
          <div className="h-72 overflow-y-auto p-4 font-mono text-xs space-y-1">
            {job.logs.length === 0 ? (
              <div className="text-gray-600">{isActive ? "Waiting for logs..." : "No logs available"}</div>
            ) : (
              job.logs.map((log, i) => (
                <div key={i} className="flex gap-3">
                  <span className="text-gray-600 shrink-0">{new Date(log.logged_at).toLocaleTimeString()}</span>
                  <span className={log.loss != null ? "text-green-400" : "text-gray-300"}>{log.log_line}</span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

        <div className="flex gap-3">
          <Link href="/new-job" className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">+ New Job</Link>
          {isActive && (
            <button onClick={async () => { await api.jobs.cancel(job.id); setJob({ ...job, status: "cancelled" }); }}
              className="border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              Cancel Job
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
