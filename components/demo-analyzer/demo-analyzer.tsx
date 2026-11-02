"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { Download, FileUp, FolderOpen, LoaderCircle, LockKeyhole, X } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import { DEMO_MAX_BYTES, type DemoAnalysis, type DemoWorkerMessage } from "@/lib/demo-analyzer";
import {
  MatchReport, AimReport, MovementReport, ShotMapReport, SkillsReport, UltimateReport,
  displayTime, reportButton, reportPanel,
} from "./report-sections";

const reportPages = [
  { value: "match", label: "Combat" },
  { value: "aim", label: "Aim" },
  { value: "shots", label: "Aim & impact" },
  { value: "skills", label: "Skills & cooldowns" },
  { value: "ultimates", label: "Ultimates" },
  { value: "movement", label: "Movement" },
] as const;

/** File and player state persists across the demo report tabs. */
export default function DemoAnalyzer() {
  const input = useRef<HTMLInputElement>(null);
  const worker = useRef<Worker | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [fileName, setFileName] = useState("");
  const [report, setResult] = useState<DemoAnalysis | null>(null);
  const result = report?.format_version === 11 ? report : null;
  const [selected, setSelected] = useState("all");

  useEffect(() => () => { worker.current?.terminate(); }, []);

  function cancel() {
    worker.current?.terminate(); worker.current = null; setBusy(false); setStatus("Analysis cancelled.");
  }

  function analyze(file: File) {
    worker.current?.terminate(); worker.current = null;
    setResult(null);
    setError(""); setErrorDetail(""); setStatus(""); setBusy(false); setSelected("all"); setFileName(file.name);
    if (!file.name.toLowerCase().endsWith(".demo")) { setError("Choose a Paladins .demo file."); return; }
    if (file.size === 0 || file.size > DEMO_MAX_BYTES) { setError("Choose a non-empty demo smaller than 64 MiB."); return; }
    try {
      const next = new Worker("/demo-analyzer/worker.js?v=metrics11-map59-documents-5", { type: "module" });
      worker.current = next; setBusy(true); setStatus("Starting analysis…");
      next.onmessage = ({ data }: MessageEvent<DemoWorkerMessage>) => {
        if (worker.current !== next) return;
        if (data.type === "progress") setStatus(data.message);
        if (data.type === "result") {
          setResult(data.result); setBusy(false);
          setStatus("Recording loaded."); next.terminate(); worker.current = null;
        }
        if (data.type === "error") { setError(data.message); setErrorDetail(data.detail ?? ""); setBusy(false); setStatus(""); next.terminate(); worker.current = null; }
      };
      next.onerror = event => {
        if (worker.current !== next) return;
        setError("Analyzer unavailable. Try reloading the page."); setErrorDetail(event.message); setStatus(""); setBusy(false); next.terminate(); worker.current = null;
      };
      next.postMessage({ file });
    } catch (failure) { setError("Could not start analysis. Try reloading the page."); setErrorDetail(failure instanceof Error ? failure.message : String(failure)); setBusy(false); }
  }

  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(result)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `${fileName}.analysis.json`; link.hidden = true;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  const players = useMemo(() => result?.players.filter(player => selected === "all" || String(player.index) === selected) ?? [], [result, selected]);
  return <div className="space-y-6">
    <PageHeader title="Demo analysis" actions={<span className="inline-flex items-center gap-2 text-xs text-pc-text-secondary"><LockKeyhole size={14} aria-hidden="true" />Processed on your device</span>} />
    <section
      className={`${reportPanel} ${dragging ? "border-pc-accent" : ""}`}
      aria-label="Demo file drop zone"
      onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragging(true); }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={event => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files.length !== 1) { setError("Drop one demo at a time."); setErrorDetail(""); return; } analyze(event.dataTransfer.files[0]); }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><FileUp className="shrink-0 text-pc-accent" size={28} aria-hidden="true" /><div><h2 className="font-semibold">{fileName || "Drop a .demo recording"}</h2><p className="mt-1 text-xs text-pc-text-muted">Or choose its file location · up to 64 MiB</p></div></div>
        <div className="flex flex-wrap gap-2"><button type="button" className={reportButton} onClick={() => input.current?.click()}><FolderOpen size={16} aria-hidden="true" />Choose file location</button>{result && <button type="button" className={reportButton} onClick={download}><Download size={16} aria-hidden="true" />Export data</button>}</div>
        <input ref={input} type="file" accept=".demo" aria-label="Demo file" className="sr-only" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) analyze(file); }} />
      </div>
      {(status || busy) && <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-pc-text-secondary">{busy && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}<span role="status" aria-live="polite">{status}</span>{busy && <button type="button" className={reportButton} onClick={cancel}><X size={16} aria-hidden="true" />Cancel</button>}</div>}
      {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
      {error && errorDetail && <details className="mt-3 text-xs text-pc-text-secondary"><summary className="w-fit cursor-pointer">Diagnostics</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">{errorDetail}</pre></details>}
      {report && !result && <p role="alert" className="mt-3 text-sm text-pc-text-secondary">Analyzer updated. Choose the recording again.</p>}
      {result && <p className="mt-3 text-xs text-pc-text-muted">{result.players.length} players · {displayTime(result.duration_s)}{Object.keys(result.decode_errors).length > 0 ? " · Some recording data is unavailable" : ""}</p>}
    </section>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <label className="text-xs font-medium text-pc-text-secondary">Analysis player<select className="pc-input mt-1 block min-h-11 min-w-48" value={selected} disabled={!result?.players.length} onChange={event => setSelected(event.target.value)}><option value="all">All players</option>{result?.players.map(player => <option key={player.index} value={String(player.index)}>{player.name ?? `Player ${player.index + 1}`}</option>)}</select></label>
    </div>
    {result && <p className="text-xs text-pc-text-muted">— / N/A / ? = unavailable</p>}
    <Tabs.Root defaultValue="aim" className="space-y-5">
      <Tabs.List aria-label="Analysis report pages" className="flex flex-wrap gap-2">
        {reportPages.map(page => <Tabs.Tab key={page.value} value={page.value} className="pc-surface inline-flex min-h-11 items-center justify-center rounded-lg border border-pc-border px-4 py-2 text-sm font-semibold text-pc-text-secondary transition-colors hover:border-pc-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pc-accent data-[active]:border-pc-accent data-[active]:bg-pc-bg-elevated data-[active]:text-pc-accent">{page.label}</Tabs.Tab>)}
      </Tabs.List>
      <Tabs.Panel value="match" keepMounted className="space-y-4 outline-none data-[hidden]:hidden"><MatchReport players={players} /></Tabs.Panel>
      <Tabs.Panel value="aim" keepMounted className="space-y-4 outline-none data-[hidden]:hidden"><AimReport players={players} /></Tabs.Panel>
      <Tabs.Panel value="shots" keepMounted className="space-y-4 outline-none data-[hidden]:hidden"><ShotMapReport players={players} /></Tabs.Panel>
      <Tabs.Panel value="skills" keepMounted className="space-y-4 outline-none data-[hidden]:hidden"><SkillsReport players={players} /></Tabs.Panel>
      <Tabs.Panel value="ultimates" keepMounted className="space-y-4 outline-none data-[hidden]:hidden"><UltimateReport players={players} /></Tabs.Panel>
      <Tabs.Panel value="movement" keepMounted className="space-y-4 outline-none data-[hidden]:hidden"><MovementReport players={players} /></Tabs.Panel>
    </Tabs.Root>
  </div>;
}
