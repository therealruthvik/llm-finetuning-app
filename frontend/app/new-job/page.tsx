"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Dataset, supabase } from "@/lib/api";
import { getHFProfile } from "@/lib/hf-profile";
import { useTheme } from "@/lib/theme";

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

const MODELS = [
  { id: "unsloth/Llama-3.2-3B-Instruct", label: "Llama 3.2 3B", note: "Recommended", desc: "Best balance of quality and speed on T4" },
  { id: "unsloth/Llama-3.2-1B-Instruct", label: "Llama 3.2 1B", note: "Fastest", desc: "Smallest model — great for quick experiments" },
  { id: "unsloth/gemma-2-2b-it", label: "Gemma 2 2B", note: "", desc: "Google's efficient instruction-tuned model" },
  { id: "unsloth/Phi-3.5-mini-instruct", label: "Phi 3.5 Mini", note: "", desc: "Microsoft's compact high-quality model" },
  { id: "unsloth/mistral-7b-instruct-v0.3", label: "Mistral 7B", note: "More VRAM", desc: "Larger model — may need batch size 1" },
];

const fieldCls = "w-full bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 text-sm transition-all";

const STEPS = [
  { id: "dataset" as const, label: "Dataset" },
  { id: "config" as const, label: "Config" },
  { id: "hf" as const, label: "HuggingFace" },
];
type StepId = "dataset" | "config" | "hf";

export default function NewJobPage() {
  const router = useRouter();
  const [step, setStep] = useState<StepId>("dataset");
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [selectedDataset, setSelectedDataset] = useState("");
  const [baseModel, setBaseModel] = useState(MODELS[0].id);
  const [epochs, setEpochs] = useState(1);
  const [loraR, setLoraR] = useState(16);
  const [learningRate, setLearningRate] = useState(0.0002);
  const [batchSize, setBatchSize] = useState(2);
  const [hfRepoName, setHfRepoName] = useState("");
  const [hfToken, setHfToken] = useState("");
  const [hfUsername, setHfUsername] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (!data.session) router.push("/"); });
    api.datasets.list().then(setDatasets).catch(console.error);
    const profile = getHFProfile();
    setHfToken(profile.hfToken);
    setHfUsername(profile.hfUsername);
  }, [router]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError("");
    try {
      const ds = await api.datasets.upload(file);
      setDatasets((prev) => [ds, ...prev]);
      setSelectedDataset(ds.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    if (!selectedDataset || !hfToken || !hfUsername || !hfRepoName) {
      setError("Please fill all required fields");
      return;
    }
    setSubmitting(true); setError("");
    try {
      const job = await api.jobs.create({
        dataset_id: selectedDataset, base_model: baseModel, epochs,
        lora_r: loraR, learning_rate: learningRate, batch_size: batchSize,
        max_seq_len: 2048, hf_token: hfToken, hf_username: hfUsername, hf_repo_name: hfRepoName,
      });
      router.push(`/jobs/${job.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start job");
      setSubmitting(false);
    }
  }

  const currentStepIndex = STEPS.findIndex((s) => s.id === step);
  const hasHFCredentials = Boolean(hfToken && hfUsername);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 text-slate-900 dark:text-white transition-colors">
      {/* Nav */}
      <nav className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-slate-200 dark:border-gray-800 h-14 px-6 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 text-slate-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-white text-sm transition-colors"
          >
            <Icon d="M15 19l-7-7 7-7" className="w-4 h-4" />
            Dashboard
          </button>
          <span className="text-slate-300 dark:text-gray-700">/</span>
          <span className="text-sm font-semibold">New Training Job</span>
        </div>
        <ThemeToggle />
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Step progress */}
        <div className="flex items-center mb-8">
          {STEPS.map((s, i) => {
            const isActive = s.id === step;
            const isDone = i < currentStepIndex;
            return (
              <div key={s.id} className="flex items-center flex-1 last:flex-none">
                <button
                  onClick={() => { if (isDone) setStep(s.id); }}
                  disabled={!isDone && !isActive}
                  className="flex flex-col items-center gap-1.5"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                    isDone
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : isActive
                      ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-500/30"
                      : "bg-white dark:bg-gray-900 border-slate-200 dark:border-gray-700 text-slate-400 dark:text-gray-600"
                  }`}>
                    {isDone ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : i + 1}
                  </div>
                  <span className={`text-xs font-medium whitespace-nowrap transition-colors ${
                    isActive ? "text-indigo-600 dark:text-indigo-400" : isDone ? "text-slate-600 dark:text-gray-300" : "text-slate-400 dark:text-gray-600"
                  }`}>
                    {s.label}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-3 mb-5 transition-colors ${i < currentStepIndex ? "bg-indigo-600" : "bg-slate-200 dark:bg-gray-800"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex gap-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 rounded-xl px-4 py-3 text-red-600 dark:text-red-400 text-sm mb-5">
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}

        {/* Step 1: Dataset */}
        {step === "dataset" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-bold mb-1">Select Dataset</h2>
              <p className="text-slate-500 dark:text-gray-400 text-sm">
                JSON array with <code className="text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-1.5 py-0.5 rounded text-xs font-mono">instruction</code> and{" "}
                <code className="text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-1.5 py-0.5 rounded text-xs font-mono">output</code> fields. CSV also supported.
              </p>
            </div>

            <div>
              <input type="file" accept=".json,.csv" onChange={handleFileUpload} className="hidden" id="file-upload" disabled={uploading} />
              <label
                htmlFor="file-upload"
                className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-200 dark:border-gray-700 rounded-2xl p-10 text-center bg-white dark:bg-gray-900 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/30 dark:hover:bg-indigo-500/5 transition-all cursor-pointer"
              >
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                  {uploading ? (
                    <svg className="w-6 h-6 text-indigo-500 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <Icon d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" className="w-6 h-6 text-indigo-500" />
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-700 dark:text-gray-200">
                    {uploading ? "Uploading…" : "Click to upload"}
                  </div>
                  <div className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">JSON or CSV · Max 50 MB</div>
                </div>
              </label>
            </div>

            {datasets.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-2">Or choose existing</div>
                <div className="space-y-2">
                  {datasets.map((ds) => (
                    <button
                      key={ds.id}
                      onClick={() => setSelectedDataset(ds.id)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                        selectedDataset === ds.id
                          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 ring-1 ring-indigo-500/20"
                          : "border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-slate-300 dark:hover:border-gray-600"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">{ds.filename}</span>
                        {selectedDataset === ds.id && (
                          <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">
                        {ds.row_count?.toLocaleString()} rows · {ds.format.toUpperCase()} · {(ds.file_size_bytes / 1024).toFixed(0)} KB
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => { setError(""); setStep("config"); }}
              disabled={!selectedDataset}
              className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl text-sm transition-all shadow-md shadow-indigo-500/20"
            >
              Continue to Configuration →
            </button>
          </div>
        )}

        {/* Step 2: Config */}
        {step === "config" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-bold mb-1">Training Configuration</h2>
              <p className="text-slate-500 dark:text-gray-400 text-sm">Choose a base model and set hyperparameters.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-2.5">Base Model</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setBaseModel(m.id)}
                    className={`text-left p-3.5 rounded-xl border transition-all ${
                      baseModel === m.id
                        ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 ring-1 ring-indigo-500/20"
                        : "border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-slate-300 dark:hover:border-gray-600"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{m.label}</span>
                      {m.note && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          m.note === "Recommended" ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400"
                          : m.note === "Fastest" ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                          : "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400"
                        }`}>
                          {m.note}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 dark:text-gray-500">{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Epochs</label>
                <input type="number" min={1} max={5} value={epochs} onChange={(e) => setEpochs(Number(e.target.value))} className={fieldCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">LoRA Rank</label>
                <select value={loraR} onChange={(e) => setLoraR(Number(e.target.value))} className={fieldCls + " cursor-pointer"}>
                  {[8, 16, 32, 64].map((r) => (
                    <option key={r} value={r}>r={r}{r === 16 ? " (recommended)" : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Learning Rate</label>
                <select value={learningRate} onChange={(e) => setLearningRate(Number(e.target.value))} className={fieldCls + " cursor-pointer"}>
                  <option value={0.0001}>1e-4 (conservative)</option>
                  <option value={0.0002}>2e-4 (recommended)</option>
                  <option value={0.0005}>5e-4 (aggressive)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Batch Size</label>
                <select value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} className={fieldCls + " cursor-pointer"}>
                  <option value={1}>1 (low VRAM)</option>
                  <option value={2}>2 (recommended)</option>
                  <option value={4}>4 (fast)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2.5 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-xl px-4 py-3 text-blue-700 dark:text-blue-300 text-xs">
              <Icon d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-4 h-4 shrink-0" />
              Runs on T4 GPU via Modal · 3B model: ~30–60 min/epoch · 3hr timeout
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep("dataset")} className="flex-1 border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-300 font-medium py-2.5 rounded-xl text-sm hover:border-slate-300 dark:hover:border-gray-600 transition-colors">
                ← Back
              </button>
              <button onClick={() => { setError(""); setStep("hf"); }} className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-all shadow-md shadow-indigo-500/20">
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: HuggingFace */}
        {step === "hf" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-bold mb-1">Output Destination</h2>
              <p className="text-slate-500 dark:text-gray-400 text-sm">Your fine-tuned model will be pushed to HuggingFace Hub after training completes.</p>
            </div>

            {hasHFCredentials ? (
              <div className="flex items-center justify-between bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
                    <Icon d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" className="w-4 h-4 text-orange-500" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 dark:text-gray-500">Connected as</div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">@{hfUsername}</div>
                    <div className="text-xs font-mono text-slate-400 dark:text-gray-500 mt-0.5">hf_•••••••••••••</div>
                  </div>
                </div>
                <button onClick={() => router.push("/dashboard")} className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                  Change →
                </button>
              </div>
            ) : (
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 rounded-xl p-4">
                <div className="font-medium text-amber-700 dark:text-amber-400 text-sm mb-1">No HuggingFace credentials saved</div>
                <div className="text-amber-600/80 dark:text-amber-500/80 text-sm mb-3">Save your HF token in Dashboard → Settings before starting a job.</div>
                <button onClick={() => router.push("/dashboard")} className="text-sm font-semibold text-amber-700 dark:text-amber-400 hover:underline">
                  Go to Dashboard Settings →
                </button>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Repository Name</label>
              <input
                type="text"
                value={hfRepoName}
                onChange={(e) => setHfRepoName(e.target.value)}
                placeholder="my-finetuned-llm"
                className={fieldCls}
              />
              {hfUsername && hfRepoName && (
                <div className="text-xs text-slate-400 dark:text-gray-500 mt-1.5">
                  Will push to: <span className="text-indigo-600 dark:text-indigo-400 font-mono">{hfUsername}/{hfRepoName}</span>
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 dark:border-gray-800 bg-slate-50 dark:bg-gray-800/50">
                <span className="text-xs font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider">Job Summary</span>
              </div>
              <div className="px-4 divide-y divide-slate-50 dark:divide-gray-800/60">
                {[
                  ["Model", MODELS.find((m) => m.id === baseModel)?.label ?? baseModel.split("/").pop()],
                  ["Epochs", epochs],
                  ["LoRA rank", `r=${loraR}`],
                  ["Learning rate", learningRate],
                  ["Batch size", batchSize],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between py-2.5 text-sm">
                    <span className="text-slate-400 dark:text-gray-500">{k}</span>
                    <span className="text-slate-900 dark:text-white font-medium">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep("config")} className="flex-1 border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-300 font-medium py-2.5 rounded-xl text-sm hover:border-slate-300 dark:hover:border-gray-600 transition-colors">
                ← Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !hfToken || !hfUsername || !hfRepoName}
                className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl text-sm transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Starting…
                  </>
                ) : (
                  <>
                    <Icon d="M13 10V3L4 14h7v7l9-11h-7z" className="w-4 h-4" />
                    Start Training
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
