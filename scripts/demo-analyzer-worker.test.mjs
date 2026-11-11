import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

// Exercise the actual bridge without instantiating WASM or reaching the network.
test("dedicated analyzer accepts only its owner channel and handles malformed messages", async () => {
  const posted = [];
  let fetches = 0;
  const self = { location: { origin: "https://site.example" }, postMessage: value => posted.push(value) };
  const source = readFileSync(new URL("../public/demo-analyzer/worker.js", import.meta.url), "utf8")
    .replace(/^import .*\n/m, "")
    .replaceAll("import.meta.url", '"https://site.example/demo-analyzer/worker.js"');
  const context = vm.createContext({ self, File, performance, URL, Uint8Array, Error,
    fetch: async () => { fetches++; return new Response(new Uint8Array([1])); },
    init: async () => {}, analyze_demo: () => '{"format_version":11}', analysis_timings: () => "{}",
  });
  vm.runInContext(source, context);
  const file = new File([new Uint8Array([1])], "recording.demo");
  await self.onmessage({ source: {}, origin: "https://site.example", data: { file } });
  await self.onmessage({ source: null, origin: "https://foreign.example", data: { file } });
  assert.equal(fetches, 0);
  assert.equal(posted.length, 0);
  await self.onmessage({ source: null, origin: "", data: null });
  assert.equal(posted.at(-1).type, "error");
  assert.equal(fetches, 0);
  await self.onmessage({ source: null, origin: "", data: { file } });
  assert.equal(fetches, 1);
  assert.equal(posted.at(-1).type, "result");
});
