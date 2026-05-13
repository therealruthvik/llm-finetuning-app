"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Job, Dataset, supabase } from "@/lib/api";
import { getHFProfile, saveHFProfile } from "@/lib/hf-profile";
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

const STATUS_CONFIG: Record<string, { dot: string; badge: string; label: string }> = {
  queued:    { dot: "bg-amber-400",           badge: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",     label: "Queued" },
  running:   { dot: "bg-blue-400 animate-pulse", badge: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20",       label: "Running" },
  completed: { dot: "bg-emerald-400",         badge: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20", label: "Completed" },
  failed:    { dot: "bg-red-400",             badge: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20",               label: "Failed" },
  cancelled: { dot: "bg-gray-400",            badge: "bg-gray-50 dark:bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-500/20",         label: "Cancelled" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.cancelled;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border whitespace-nowrap ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [hfToken, setHfToken] = useState("");
  const [hfUsername, setHfUsername] = useState("");
  const [hfSaved, setHfSaved] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push("/"); setLoading(false); return; }
      setUserEmail(data.session.user.email ?? "");
      Promise.all([api.jobs.list(), api.datasets.list()])
        .then(([j, d]) => { setJobs(j); setDatasets(d); })
        .catch(console.error)
        .finally(() => setLoading(false));
    });
    const profile = getHFProfile();
    setHfToken(profile.hfToken);
    setHfUsername(profile.hfUsername);
  }, [router]);

  useEffect(() => {
    const running = jobs.filter((j) => j.status === "queued" || j.status === "running");
    if (!running.length) return;
    const interval = setInterval(async () => {
      const updated = await api.jobs.list().catch(() => jobs);
      setJobs(updated);
    }, 10000);
    return () => clearInterval(interval);
  }, [jobs]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  async function handleDeleteDataset(id: string) {
    await api.datasets.delete(id);
    setDatasets((d) => d.filter((ds) => ds.id !== id));
  }

  function handleSaveHF() {
    saveHFProfile(hfToken, hfUsername);
    setHfSaved(true);
    setTimeout(() => setHfSaved(false), 2000);
    setShowSettings(false);
  }

  const hasHFCredentials = Boolean(hfToken && hfUsername);
  const activeCount = jobs.filter((j) => ["queued", "running"].includes(j.status)).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-gray-950 flex items-center justify-center transition-colors">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-400 dark:text-gray-500 text-sm">Loading dashboard…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 text-slate-900 dark:text-white transition-colors">
      {/* Nav */}
      <nav className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-slate-200 dark:border-gray-800 h-14 px-6 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow shadow-indigo-500/25">
            <Icon d="M13 10V3L4 14h7v7l9-11h-7z" className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-[15px] tracking-tight">FineTune</span>
          {activeCount > 0 && (
            <span className="text-xs bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-medium">
              {activeCount} running
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400 dark:text-gray-500 text-xs hidden sm:block truncate max-w-[180px]">{userEmail}</span>
          <div className="w-px h-4 bg-slate-200 dark:bg-gray-700 mx-1 hidden sm:block" />
          <Link
            href="/new-job"
            className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all shadow-sm shadow-indigo-500/20"
          >
            <Icon d="M12 4v16m8-8H4" className="w-3.5 h-3.5" />
            New Job
          </Link>
          <button
            onClick={() => setShowSettings((s) => !s)}
            title="HuggingFace Settings"
            className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all ${
              showSettings
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                : "border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 hover:border-slate-300 dark:hover:border-gray-600"
            }`}
          >
            <Icon d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" className="w-4 h-4" />
          </button>
          <ThemeToggle />
          <button
            onClick={handleSignOut}
            className="text-slate-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-white text-xs px-2 py-1 rounded transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* HF Settings panel */}
        {showSettings && (
          <div className="bg-white dark:bg-gray-900 border border-indigo-200 dark:border-indigo-500/20 rounded-2xl p-5 shadow-sm ring-1 ring-indigo-500/10">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">HuggingFace Credentials</h2>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  Saved once — pre-filled on every new job. Token needs write access.
                </p>
              </div>
              {hasHFCredentials && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/25 font-medium">
                  Connected
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-gray-400 mb-1.5">Username</label>
                <input
                  type="text"
                  value={hfUsername}
                  onChange={(e) => setHfUsername(e.target.value)}
                  placeholder="your-hf-username"
                  className="w-full bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 text-sm transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-gray-400 mb-1.5">Access Token (write)</label>
                <input
                  type="password"
                  value={hfToken}
                  onChange={(e) => setHfToken(e.target.value)}
                  placeholder="hf_…"
                  className="w-full bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 text-sm font-mono transition-all"
                />
              </div>
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={handleSaveHF}
                disabled={!hfToken || !hfUsername}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {hfSaved ? "✓ Saved" : "Save credentials"}
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-400 hover:border-slate-300 dark:hover:border-gray-600 text-xs font-medium px-4 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* HF warning */}
        {!hasHFCredentials && !showSettings && (
          <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2.5 text-amber-700 dark:text-amber-400 text-sm">
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              HuggingFace credentials not configured — models won&apos;t push after training.
            </div>
            <button
              onClick={() => setShowSettings(true)}
              className="text-amber-700 dark:text-amber-400 text-xs font-semibold hover:underline ml-4 shrink-0"
            >
              Set up now →
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Jobs", value: jobs.length, icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
            { label: "Active", value: activeCount, icon: "M13 10V3L4 14h7v7l9-11h-7z", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
            { label: "Datasets", value: datasets.length, icon: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4", color: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
          ].map((s) => (
            <div key={s.label} className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm">
              <div className={`w-9 h-9 rounded-xl ${s.color} flex items-center justify-center mb-3`}>
                <Icon d={s.icon} className="w-4 h-4" />
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white leading-none mb-1">{s.value}</div>
              <div className="text-xs text-slate-400 dark:text-gray-500 font-medium">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Jobs */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-widest">Training Jobs</h2>
            <Link href="/new-job" className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:text-indigo-500 transition-colors">
              + New job
            </Link>
          </div>

          {jobs.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 border-2 border-dashed border-slate-200 dark:border-gray-800 rounded-2xl p-14 text-center">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-4">
                <Icon d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" className="w-6 h-6 text-indigo-500" />
              </div>
              <div className="text-slate-700 dark:text-gray-300 font-semibold mb-1">No training jobs yet</div>
              <div className="text-slate-400 dark:text-gray-500 text-sm mb-5">Upload a dataset and launch your first fine-tuning run</div>
              <Link
                href="/new-job"
                className="inline-flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-all shadow-md shadow-indigo-500/20"
              >
                <Icon d="M12 4v16m8-8H4" className="w-4 h-4" />
                Start first job
              </Link>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100 dark:divide-gray-800">
              {jobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors group"
                >
                  <StatusBadge status={job.status} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                      {job.hf_username}/{job.hf_repo_name}
                    </div>
                    <div className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">
                      {job.base_model.split("/").pop()} · {job.epochs} epoch{job.epochs !== 1 ? "s" : ""} · LoRA r={job.lora_r}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {job.final_loss != null && (
                      <div className="text-xs font-mono text-slate-600 dark:text-gray-300">loss {job.final_loss.toFixed(4)}</div>
                    )}
                    <div className="text-xs text-slate-400 dark:text-gray-600">
                      {new Date(job.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <Icon d="M9 5l7 7-7 7" className="w-4 h-4 text-slate-300 dark:text-gray-600 group-hover:text-indigo-400 transition-colors shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Datasets */}
        <section>
          <h2 className="text-xs font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-3">Datasets</h2>
          {datasets.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-gray-500">No datasets uploaded yet. Upload one when creating a new job.</p>
          ) : (
            <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100 dark:divide-gray-800">
              {datasets.map((ds) => (
                <div key={ds.id} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                      <Icon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" className="w-4 h-4 text-violet-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{ds.filename}</div>
                      <div className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">
                        {ds.row_count ? `${ds.row_count.toLocaleString()} rows · ` : ""}{ds.format.toUpperCase()} · {(ds.file_size_bytes / 1024).toFixed(0)} KB
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteDataset(ds.id)}
                    title="Delete dataset"
                    className="text-slate-400 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 shrink-0 ml-3"
                  >
                    <Icon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
