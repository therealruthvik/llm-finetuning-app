"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Job, Dataset, supabase } from "@/lib/api";
import { getHFProfile, saveHFProfile } from "@/lib/hf-profile";
import { useTheme } from "@/lib/theme";
import Link from "next/link";

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-500/30",
  running: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30",
  completed: "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/30",
  failed: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30",
  cancelled: "bg-slate-100 dark:bg-gray-500/10 text-slate-500 dark:text-gray-400 border-slate-200 dark:border-gray-500/30",
};

const STATUS_ICONS: Record<string, string> = {
  queued: "⏳", running: "⚡", completed: "✅", failed: "❌", cancelled: "🚫",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium inline-flex items-center gap-1 ${STATUS_COLORS[status] ?? ""}`}>
      <span>{STATUS_ICONS[status]}</span>
      {status}
    </span>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { theme, toggle } = useTheme();
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
        .catch((err) => console.error(err))
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

  const hasHFCredentials = hfToken && hfUsername;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-gray-950 text-slate-900 dark:text-white transition-colors">
      <nav className="bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm">⚡</span>
          </div>
          <span className="text-slate-900 dark:text-white font-bold tracking-tight">FineTune</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-400 dark:text-gray-500 text-sm hidden sm:block">{userEmail}</span>
          <Link
            href="/new-job"
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            + New Job
          </Link>
          <button
            onClick={() => setShowSettings((s) => !s)}
            className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
              showSettings
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                : "border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-400 hover:border-slate-300 dark:hover:border-gray-600"
            }`}
          >
            ⚙️ Settings
          </button>
          <button
            onClick={toggle}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-gray-700 text-sm hover:border-indigo-400 transition-all"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button onClick={handleSignOut} className="text-slate-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-white text-sm transition-colors">
            Sign out
          </button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* HuggingFace Settings panel */}
        {showSettings && (
          <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">HuggingFace Account</h2>
                <p className="text-sm text-slate-500 dark:text-gray-400 mt-0.5">
                  Set once — pre-filled on every new job. Only repo name is asked per job.
                </p>
              </div>
              {hasHFCredentials && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/30 font-medium">
                  ✓ Saved
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1.5">
                  HF Username
                </label>
                <input
                  type="text"
                  value={hfUsername}
                  onChange={(e) => setHfUsername(e.target.value)}
                  placeholder="your-hf-username"
                  className="w-full bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3.5 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1.5">
                  HF Token (Write access)
                </label>
                <input
                  type="password"
                  value={hfToken}
                  onChange={(e) => setHfToken(e.target.value)}
                  placeholder="hf_..."
                  className="w-full bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3.5 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm font-mono transition-colors"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleSaveHF}
                disabled={!hfToken || !hfUsername}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {hfSaved ? "✓ Saved!" : "Save credentials"}
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-400 hover:border-slate-300 dark:hover:border-gray-600 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!hasHFCredentials && !showSettings && (
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-amber-700 dark:text-amber-400 text-sm">
              ⚠️ HuggingFace credentials not set — models can&apos;t be pushed after training.
            </span>
            <button
              onClick={() => setShowSettings(true)}
              className="text-amber-700 dark:text-amber-400 text-sm font-medium underline hover:no-underline ml-4 shrink-0"
            >
              Add now
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Jobs", value: jobs.length, icon: "🔬" },
            { label: "Active", value: jobs.filter((j) => ["queued","running"].includes(j.status)).length, icon: "⚡" },
            { label: "Datasets", value: datasets.length, icon: "📁" },
          ].map((s) => (
            <div key={s.label} className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl p-5 shadow-sm">
              <div className="text-2xl mb-1">{s.icon}</div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{s.value}</div>
              <div className="text-slate-500 dark:text-gray-400 text-sm mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Jobs */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">
              Training Jobs
            </h2>
            <Link href="/new-job" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 text-sm font-medium">
              + New job →
            </Link>
          </div>
          {jobs.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 border-2 border-dashed border-slate-200 dark:border-gray-700 rounded-2xl p-12 text-center">
              <div className="text-4xl mb-3">🚀</div>
              <div className="text-slate-800 dark:text-gray-300 font-semibold mb-1">No jobs yet</div>
              <div className="text-slate-500 dark:text-gray-500 text-sm mb-5">Upload a dataset and start fine-tuning your first model</div>
              <Link href="/new-job" className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors inline-block">
                Start your first job
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <Link key={job.id} href={`/jobs/${job.id}`}>
                  <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl px-4 py-3.5 flex items-center justify-between hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:shadow-sm transition-all cursor-pointer group">
                    <div className="flex items-center gap-3">
                      <StatusBadge status={job.status} />
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {job.hf_username}/{job.hf_repo_name}
                        </div>
                        <div className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">
                          {job.base_model.split("/").pop()} · {job.epochs} epoch(s) · LoRA r={job.lora_r}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {job.final_loss != null && (
                        <div className="text-xs text-slate-600 dark:text-gray-300 font-mono">
                          loss {job.final_loss.toFixed(4)}
                        </div>
                      )}
                      <div className="text-xs text-slate-400 dark:text-gray-600 mt-0.5">
                        {new Date(job.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Datasets */}
        <section>
          <h2 className="text-sm font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider mb-4">
            Datasets
          </h2>
          {datasets.length === 0 ? (
            <div className="text-slate-400 dark:text-gray-500 text-sm">No datasets uploaded yet.</div>
          ) : (
            <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
              {datasets.map((ds, i) => (
                <div
                  key={ds.id}
                  className={`flex items-center justify-between px-4 py-3.5 ${i > 0 ? "border-t border-slate-100 dark:border-gray-800" : ""}`}
                >
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">{ds.filename}</div>
                    <div className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">
                      {ds.row_count ? `${ds.row_count.toLocaleString()} rows · ` : ""}
                      {ds.format.toUpperCase()} · {(ds.file_size_bytes / 1024).toFixed(0)} KB
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteDataset(ds.id)}
                    className="text-red-400 hover:text-red-600 dark:hover:text-red-300 text-xs font-medium transition-colors px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
