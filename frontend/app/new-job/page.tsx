"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Dataset, supabase } from "@/lib/api";

const MODELS = [
  { id: "unsloth/Llama-3.2-3B-Instruct", label: "Llama 3.2 3B (Recommended)" },
  { id: "unsloth/Llama-3.2-1B-Instruct", label: "Llama 3.2 1B (Fastest)" },
  { id: "unsloth/gemma-2-2b-it", label: "Gemma 2 2B" },
  { id: "unsloth/Phi-3.5-mini-instruct", label: "Phi 3.5 Mini" },
  { id: "unsloth/mistral-7b-instruct-v0.3", label: "Mistral 7B (More VRAM)" },
];

export default function NewJobPage() {
  const router = useRouter();
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
  const [hfToken, setHfToken] = useState("");
  const [hfUsername, setHfUsername] = useState("");
  const [hfRepoName, setHfRepoName] = useState("my-devops-llm");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (!data.session) router.push("/"); });
    api.datasets.list().then(setDatasets).catch(console.error);
  }, [router]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError("");
    try {
      const ds = await api.datasets.upload(file);
      setDatasets((prev) => [ds, ...prev]);
      setSelectedDataset(ds.id);
    } catch (err: any) { setError(err.message); }
    finally { setUploading(false); }
  }

  async function handleSubmit() {
    if (!selectedDataset || !hfToken || !hfUsername || !hfRepoName) { setError("Fill all required fields"); return; }
    setSubmitting(true); setError("");
    try {
      const job = await api.jobs.create({
        dataset_id: selectedDataset, base_model: baseModel, epochs,
        lora_r: loraR, learning_rate: learningRate, batch_size: batchSize,
        max_seq_len: 2048, hf_token: hfToken, hf_username: hfUsername, hf_repo_name: hfRepoName,
      });
      router.push(`/jobs/${job.id}`);
    } catch (err: any) { setError(err.message); setSubmitting(false); }
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-gray-800 px-6 py-3 flex items-center gap-4">
        <button onClick={() => router.push("/dashboard")} className="text-gray-400 hover:text-white text-sm">← Dashboard</button>
        <span className="text-white font-medium">New Training Job</span>
      </nav>
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center gap-2 text-sm">
          {["dataset", "config", "hf"].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <span className="text-gray-600">→</span>}
              <span className={step === s ? "text-indigo-400 font-medium" : "text-gray-500"}>
                {i + 1}. {s === "dataset" ? "Dataset" : s === "config" ? "Config" : "HuggingFace"}
              </span>
            </div>
          ))}
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>}

        {step === "dataset" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-1">Select Dataset</h2>
              <p className="text-gray-400 text-sm">JSON with <code className="text-indigo-300">instruction</code> + <code className="text-indigo-300">output</code> fields.</p>
            </div>
            <div className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center hover:border-indigo-500 transition-colors">
              <input type="file" accept=".json,.csv" onChange={handleFileUpload} className="hidden" id="file-upload" disabled={uploading} />
              <label htmlFor="file-upload" className="cursor-pointer">
                <div className="text-3xl mb-2">📁</div>
                <div className="text-sm font-medium text-white">{uploading ? "Uploading..." : "Click to upload JSON or CSV"}</div>
                <div className="text-xs text-gray-500 mt-1">Max 50MB</div>
              </label>
            </div>
            {datasets.length > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-400 mb-2">Or select existing:</div>
                <div className="space-y-2">
                  {datasets.map((ds) => (
                    <button key={ds.id} onClick={() => setSelectedDataset(ds.id)}
                      className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${selectedDataset === ds.id ? "border-indigo-500 bg-indigo-500/10" : "border-gray-700 bg-gray-900 hover:border-gray-500"}`}>
                      <div className="text-sm font-medium text-white">{ds.filename}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{ds.row_count?.toLocaleString()} rows · {ds.format.toUpperCase()}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => setStep("config")} disabled={!selectedDataset}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-medium py-2 rounded-lg transition-colors">
              Continue →
            </button>
          </div>
        )}

        {step === "config" && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold">Training Config</h2>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Base Model</label>
              <select value={baseModel} onChange={(e) => setBaseModel(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Epochs</label>
                <input type="number" min={1} max={5} value={epochs} onChange={(e) => setEpochs(Number(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">LoRA Rank</label>
                <select value={loraR} onChange={(e) => setLoraR(Number(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                  {[8,16,32,64].map((r) => <option key={r} value={r}>r={r}{r===16?" (rec)":""}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Learning Rate</label>
                <select value={learningRate} onChange={(e) => setLearningRate(Number(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                  <option value={0.0001}>1e-4</option>
                  <option value={0.0002}>2e-4 (rec)</option>
                  <option value={0.0005}>5e-4</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Batch Size</label>
                <select value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                  <option value={1}>1</option>
                  <option value={2}>2 (rec)</option>
                  <option value={4}>4</option>
                </select>
              </div>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-3 text-blue-300 text-sm">
              💡 T4 GPU · 3B model ~30–60 min per epoch
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep("dataset")} className="flex-1 border border-gray-700 text-gray-300 font-medium py-2 rounded-lg text-sm hover:border-gray-500 transition-colors">← Back</button>
              <button onClick={() => setStep("hf")} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-lg text-sm transition-colors">Continue →</button>
            </div>
          </div>
        )}

        {step === "hf" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold mb-1">HuggingFace Output</h2>
              <p className="text-gray-400 text-sm">Model will be pushed to your HF Hub repo.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">HF Token <span className="text-red-400">*</span></label>
              <input type="password" value={hfToken} onChange={(e) => setHfToken(e.target.value)} placeholder="hf_..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 font-mono" />
              <p className="text-xs text-gray-500 mt-1">
                Get at <a href="https://huggingface.co/settings/tokens" target="_blank" className="text-indigo-400 hover:underline">huggingface.co/settings/tokens</a> · Write permission required
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">HF Username</label>
                <input type="text" value={hfUsername} onChange={(e) => setHfUsername(e.target.value)} placeholder="your-username"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Repo Name</label>
                <input type="text" value={hfRepoName} onChange={(e) => setHfRepoName(e.target.value)} placeholder="my-llm"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
            </div>
            {hfUsername && hfRepoName && (
              <div className="text-xs text-gray-400 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
                Pushes to: <span className="text-indigo-300 font-mono">{hfUsername}/{hfRepoName}</span>
              </div>
            )}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2 text-sm">
              <div className="font-medium text-gray-300 mb-2">Summary</div>
              {[["Model", baseModel.split("/").pop()], ["Epochs", epochs], ["LoRA r", loraR], ["LR", learningRate]].map(([k,v]) => (
                <div key={String(k)} className="flex justify-between">
                  <span className="text-gray-500">{k}</span>
                  <span className="text-white">{String(v)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep("config")} className="flex-1 border border-gray-700 text-gray-300 font-medium py-2 rounded-lg text-sm hover:border-gray-500 transition-colors">← Back</button>
              <button onClick={handleSubmit} disabled={submitting || !hfToken || !hfUsername}
                className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white font-medium py-2 rounded-lg text-sm transition-colors">
                {submitting ? "Starting..." : "🚀 Start Training"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
