// Minimal file/WASM bridge; all demo reconstruction is performed by Rust.
import init, { analyze_demo, analysis_timings } from "./pkg/paladins_demo_analyzer.js?v=metrics11-map59-documents-5";

self.onmessage = async ({ data: { file } }) => {
  let userMessage = "Could not analyze this recording. Try another .demo file.";
  try {
    if (!(file instanceof File) || file.size > 64 * 1024 * 1024) {
      throw new Error("Choose a demo file smaller than 64 MiB.");
    }
    const start = performance.now();
    self.postMessage({ type: "progress", message: "Loading analyzer…", elapsed_ms: performance.now() - start });
    const [metadata] = await Promise.all([
      fetch("./schema.bin.gz", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) { userMessage = "Analyzer unavailable. Try reloading the page."; throw new Error(`Analyzer data request failed (${response.status}).`); }
        return new Uint8Array(await response.arrayBuffer());
      }),
      init({ module_or_path: new URL("./pkg/paladins_demo_analyzer_bg.wasm?v=metrics11-map59-documents-5", import.meta.url) }),
    ]);
    const bytes = new Uint8Array(await file.arrayBuffer());
    self.postMessage({ type: "progress", message: "Analyzing recording…", elapsed_ms: performance.now() - start });
    const processingStart = performance.now();
    const encoded = analyze_demo(bytes, metadata);
    const encodedAt = performance.now();
    const result = JSON.parse(encoded);
    const parsedAt = performance.now();
    if (result.format_version !== 11) { userMessage = "Analyzer updated. Reload the page and choose the recording again."; throw new Error(`Unexpected analyzer format: ${result.format_version}`); }
    self.postMessage({ type: "result", result, elapsed_ms: parsedAt - start,
      posted_at_ms: performance.timeOrigin + performance.now(),
      timings: { initialization_ms: processingStart - start, wasm_call_ms: encodedAt - processingStart,
        json_parse_ms: parsedAt - encodedAt, report_json_chars: encoded.length,
        rust_phases: JSON.parse(analysis_timings()) } });
  } catch (error) {
    self.postMessage({ type: "error", message: userMessage, detail: error instanceof Error ? error.message : String(error) });
  }
};
