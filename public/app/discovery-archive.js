/* Explicit older-data requests. Constructing or resetting a loader performs no I/O. */
(() => {
  'use strict';
  const id = value => {
    if (!/^[1-9]\d{0,12}$/.test(String(value))) throw new Error('Invalid resource ID');
    return String(value);
  };
  const page = (limit, offset) => new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const playerMatches = (value, older = false, limit = 25, offset = 0) =>
    (older ? '/archive' : '') + '/players/' + id(value) + '/matches?' + page(limit, offset);
  const playerCharts = (value, older = false, limit = 50, offset = 0) =>
    (older ? '/archive' : '') + '/players/' + id(value) + '/charts?' + page(limit, offset);
  const match = (value, older = false) => (older ? '/archive' : '') + '/matches/' + id(value);
  const searchMatch = value => '/archive/search/matches/' + id(value);

  function createLoader({ request, current = () => true, changed = () => {} }) {
    let generation = 0, controller, last, state = { status: 'idle', data: null, error: null, meta: null };
    const dispose = () => { generation++; controller?.abort(); last = null; document.removeEventListener('discovery:view-changed', deactivate); };
    const deactivate = () => { if (!current()) dispose(); };
    document.addEventListener('discovery:view-changed', deactivate);
    const publish = value => { state = value; if (current()) changed(state); };
    async function run(path, meta = {}, timeoutMs = 30_000) {
      if (!current()) return;
      controller?.abort();
      const token = ++generation;
      controller = new AbortController();
      last = { path, meta, timeoutMs };
      publish({ status: 'loading', data: null, error: null, meta });
      try {
        const data = await request(path, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]), timeoutMs,
        });
        if (token !== generation || !current()) return;
        publish({ status: 'ready', data, error: null, meta });
        return data;
      } catch (error) {
        if (token !== generation || !current()) return;
        publish({ status: 'error', data: null, error, meta });
      }
    }
    return {
      run,
      retry: () => last && run(last.path, last.meta, last.timeoutMs),
      reset() { generation++; controller?.abort(); last = null; publish({ status: 'idle', data: null, error: null, meta: null }); },
      dispose,
      snapshot: () => state,
    };
  }
  window.DiscoveryArchive = Object.freeze({ playerMatches, playerCharts, match, searchMatch, createLoader });
})();
