"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Job, Dataset, supabase } from "@/lib/api";
import Link from "next/link";

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  running: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  completed: "bg-green-500/10 text-green-400 border-green-500/30",
  failed: "bg-red-500/10 text-red-400 border-red-500/30",
  cancelled: "bg-gray-500/10 text-gray-400 border-gray-500/30",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[status] ?? ""}`}>
      {status}
    </span>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.push("/");
        setLoading(false);
        return;
      }
      setUserEmail(data.session.user.email ?? "");
      Promise.all([api.jobs.list(), api.datasets.list()])
        .then(([j, d]) => { setJobs(j); setDatasets(d); })
        .catch((err) => console.error(err))
        .finally(() => setLoading(false));
    });
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <span className="text-indigo-400 font-bold">⚡ FineTune</span>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{userEmail}</span>
          <Link href="/new-job" className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">
            + New Job
          </Link>
          <button onClick={handleSignOut} className="text-gray-400 hover:text-white text-sm">Sign out</button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Jobs", value: jobs.length },
            { label: "Active", value: jobs.filter((j) => ["queued","running"].includes(j.status)).length },
            { label: "Datasets", value: datasets.length },
          ].map((s) => (
            <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div className="text-gray-400 text-sm mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Jobs</h2>
            <Link href="/new-job" className="text-indigo-400 hover:text-indigo-300 text-sm">+ New job →</Link>
          </div>
          {jobs.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 border-dashed rounded-xl p-12 text-center">
              <div className="text-4xl mb-3">🚀</div>
              <div className="text-gray-300 font-medium mb-1">No jobs yet</div>
              <div className="text-gray-500 text-sm mb-4">Upload your dataset and start fine-tuning</div>
              <Link href="/new-job" className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                Start your first job
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <Link key={job.id} href={`/jobs/${job.id}`}>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between hover:border-gray-600 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <StatusBadge status={job.status} />
                      <div>
                        <div className="text-sm font-medium text-white">{job.hf_username}/{job.hf_repo_name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {job.base_model.split("/").pop()} · {job.epochs} epoch(s) · LoRA r={job.lora_r}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {job.final_loss && <div className="text-xs text-gray-300">loss {job.final_loss.toFixed(4)}</div>}
                      <div className="text-xs text-gray-600 mt-0.5">{new Date(job.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Datasets</h2>
          {datasets.length === 0 ? (
            <div className="text-gray-500 text-sm">No datasets uploaded yet.</div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {datasets.map((ds, i) => (
                <div key={ds.id} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t border-gray-800" : ""}`}>
                  <div>
                    <div className="text-sm font-medium text-white">{ds.filename}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {ds.row_count ? `${ds.row_count.toLocaleString()} rows · ` : ""}{ds.format.toUpperCase()}
                    </div>
                  </div>
                  <button onClick={() => handleDeleteDataset(ds.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
