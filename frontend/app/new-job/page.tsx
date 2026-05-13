"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Dataset, supabase } from "@/lib/api";
import { getHFProfile } from "@/lib/hf-profile";
import { useTheme } from "@/lib/theme";

const MODELS = [
  { id: "unsloth/Llama-3.2-3B-Instruct", label: "Llama 3.2 3B", note: "Recommended" },
  { id: "unsloth/Llama-3.2-1B-Instruct", label: "Llama 3.2 1B", note: "Fastest" },
  { id: "unsloth/gemma-2-2b-it", label: "Gemma 2 2B", note: "" },
  { id: "unsloth/Phi-3.5-mini-instruct", label: "Phi 3.5 Mini", note: "" },
  { id: "unsloth/mistral-7b-instruct-v0.3", label: "Mistral 7B", note: "More VRAM" },
];

const inputCls = "w-full bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3.5 py-2.5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-colors";
const selectCls = inputCls;

export default function NewJobPage() {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [step, setStep] = useState<"dataset" | "config" | "hf">("dataset");
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
      setError("Fill all required fields");
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

  const hasHFCredentials = hfToken && hfUsername;
  const steps = [
    { id: "dataset", label: "Dataset" },
    { id: "config", label: "Config" },
    { id: "hf", label: "HuggingFace" },
  ] as const;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-gray-950 text-slate-900 dark:text-white transition-colors">
      <nav className="bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-slate-400 dark:text-gray-400 hover:text-slate-700 dark:hover:text-white text-sm transition-colors"
          >
            ← Dashboard
          </button>
          <span className="text-slate-900 dark:text-white font-semibold">New Training Job</span>
        </div>
        <button
          onClick={toggle}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-gray-700 text-sm hover:border-indigo-400 transition-all"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Step indicator */}
        <div className="flex items-center gap-2 text-sm">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              {i > 0 && <span className="text-slate-300 dark:text-gray-700">→</span>}
              <button
                onClick={() => {
                  if (s.id === "config" && step === "hf") setStep("config");
                  if (s.id === "dataset" && step !== "dataset") setStep("dataset");
                }}
                className={`font-medium transition-colors ${
                  step === s.id
                    ? "text-indigo-600 dark:text-indigo-400"
                    : steps.findIndex((x) => x.id === step) > i
                    ? "text-slate-500 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                    : "text-slate-300 dark:text-gray-600 cursor-default"
                }`}
              >
                {i + 1}. {s.label}
              </button>
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-4 py-3 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Step 1: Dataset */}
        {step === "dataset" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-bold mb-1">Select Dataset</h2>
              <p className="text-slate-500 dark:text-gray-400 text-sm">
                JSON array with <code className="text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 px-1.5 py-0.5 rounded text-xs">instruction</code> and{" "}
                <code className="text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 px-1.5 py-0.5 rounded text-xs">output</code> fields. CSV also supported.
              </p>
            </div>
            <div className="border-2 border-dashed border-slate-200 dark:border-gray-700 rounded-xl p-8 text-center hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors bg-white dark:bg-gray-900">
              <input type="file" accept=".json,.csv" onChange={handleFileUpload} className="hidden" id="file-upload" disabled={uploading} />
              <label htmlFor="file-upload" className="cursor-pointer block">
                <div className="text-4xl mb-3">{uploading ? "⏳" : "📁"}</div>
                <div className="text-sm font-semibold text-slate-800 dark:text-gray-200">
                  {uploading ? "Uploading…" : "Click to upload JSON or CSV"}
                </div>
                <div className="text-xs text-slate-400 dark:text-gray-500 mt-1">Max 50MB</div>
              </label>
            </div>
            {datasets.length > 0 && (
              <div>
                <div className="text-sm font-medium text-slate-500 dark:text-gray-400 mb-2">Or select existing:</div>
                <div className="space-y-2">
                  {datasets.map((ds) => (
                    <button
                      key={ds.id}
                      onClick={() => setSelectedDataset(ds.id)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                        selectedDataset === ds.id
                          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
                          : "border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-slate-300 dark:hover:border-gray-600"
                      }`}
                    >
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{ds.filename}</div>
                      <div className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">
                        {ds.row_count?.toLocaleString()} rows · {ds.format.toUpperCase()}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={() => setStep("config")}
              disabled={!selectedDataset}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors"
            >
              Continue →
            </button>
          </div>
        )}

        {/* Step 2: Config */}
        {step === "config" && (
          <div className="space-y-5">
            <h2 className="text-lg font-bold">Training Config</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1.5">Base Model</label>
              <select value={baseModel} onChange={(e) => setBaseModel(e.target.value)} className={selectCls}>
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}{m.note ? ` (${m.note})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1.5">Epochs</label>
                <input type="number" min={1} max={5} value={epochs} onChange={(e) => setEpochs(Number(e.target.value))} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1.5">LoRA Rank</label>
                <select value={loraR} onChange={(e) => setLoraR(Number(e.target.value))} className={selectCls}>
                  {[8, 16, 32, 64].map((r) => (
                    <option key={r} value={r}>r={r}{r === 16 ? " (recommended)" : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1.5">Learning Rate</label>
                <select value={learningRate} onChange={(e) => setLearningRate(Number(e.target.value))} className={selectCls}>
                  <option value={0.0001}>1e-4</option>
                  <option value={0.0002}>2e-4 (recommended)</option>
                  <option value={0.0005}>5e-4</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1.5">Batch Size</label>
                <select value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} className={selectCls}>
                  <option value={1}>1</option>
                  <option value={2}>2 (recommended)</option>
                  <option value={4}>4</option>
                </select>
              </div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-xl px-4 py-3 text-blue-700 dark:text-blue-300 text-sm">
              💡 T4 GPU · 3B model ~30–60 min per epoch
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep("dataset")} className="flex-1 border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-300 font-medium py-2.5 rounded-xl text-sm hover:border-slate-300 dark:hover:border-gray-600 transition-colors">
                ← Back
              </button>
              <button onClick={() => setStep("hf")} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: HuggingFace */}
        {step === "hf" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-bold mb-1">HuggingFace Output</h2>
              <p className="text-slate-500 dark:text-gray-400 text-sm">Model pushed to your HF Hub repo after training.</p>
            </div>

            {hasHFCredentials ? (
              <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl px-4 py-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400 dark:text-gray-500 mb-0.5">HuggingFace account</div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">@{hfUsername}</div>
                  <div className="text-xs text-slate-400 dark:text-gray-500 mt-0.5 font-mono">Token: hf_•••••••••••••</div>
                </div>
                <button
                  onClick={() => router.push("/dashboard")}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Change in Settings
                </button>
              </div>
            ) : (
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl px-4 py-4">
                <div className="text-amber-700 dark:text-amber-400 text-sm font-medium mb-1">
                  ⚠️ No HuggingFace credentials saved
                </div>
                <div className="text-amber-600 dark:text-amber-500 text-sm">
                  Go to Dashboard → Settings to save your HF token and username before starting a job.
                </div>
                <button
                  onClick={() => router.push("/dashboard")}
                  className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-400 underline hover:no-underline"
                >
                  Go to Settings →
                </button>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1.5">
                Repository Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={hfRepoName}
                onChange={(e) => setHfRepoName(e.target.value)}
                placeholder="my-finetuned-llm"
                className={inputCls}
              />
              {hfUsername && hfRepoName && (
                <p className="text-xs text-slate-400 dark:text-gray-500 mt-1.5">
                  Pushes to:{" "}
                  <span className="text-indigo-600 dark:text-indigo-300 font-mono">{hfUsername}/{hfRepoName}</span>
                </p>
              )}
            </div>

            {/* Summary */}
            <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl p-4 space-y-2">
              <div className="text-sm font-semibold text-slate-700 dark:text-gray-300 mb-3">Job Summary</div>
              {[
                ["Model", baseModel.split("/").pop()],
                ["Epochs", epochs],
                ["LoRA r", loraR],
                ["Learning Rate", learningRate],
                ["Batch Size", batchSize],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-gray-500">{k}</span>
                  <span className="text-slate-900 dark:text-white font-medium">{String(v)}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep("config")} className="flex-1 border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-300 font-medium py-2.5 rounded-xl text-sm hover:border-slate-300 dark:hover:border-gray-600 transition-colors">
                ← Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !hfToken || !hfUsername || !hfRepoName}
                className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
              >
                {submitting ? "Starting…" : "🚀 Start Training"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
