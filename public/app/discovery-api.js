/* Public data transport shared by native views and the compiled dashboard widgets. */
(() => {
  'use strict';
  if (window.DiscoveryApi) return;
  const originalFetch = window.fetch.bind(window);

  function url(input, method = 'GET') {
    const value = new URL(input, location.href);
    if (value.origin !== location.origin || !/^\/(?:api|_pc)(?:\/|$)/.test(value.pathname)) return value.href;
    const path = value.pathname.replace(/^\/(?:api|_pc)(?:\/v1)?(?=\/|$)/, '') || '/';
    // The browser app is a guest website client. It holds no developer key, and
    // `/api/v1/*` answers 401 to a session cookie, so every call — including
    // the draft's own `/api/v1/...` literals — is collapsed onto the
    // session-backed `/api` contract. Keyed clients do not load this file.
    value.pathname = '/api' + path;
    return value.href;
  }

  function path(input, method = 'GET') {
    const value = new URL(url('/api' + input, method));
    return value.pathname + value.search + value.hash;
  }

  function publicFetch(input, options) {
    const request = typeof Request !== 'undefined' && input instanceof Request;
    const source = request ? input.url : String(input);
    const destination = url(source, options?.method || (request ? input.method : 'GET'));
    if (new URL(source, location.href).href === destination) return originalFetch(input, options);
    return originalFetch(request ? new Request(destination, input) : destination, options);
  }

  // Some source-owned widgets contain their own API client. One document-scoped
  // boundary keeps those requests on the same contract as DiscoveryApp.
  window.fetch = publicFetch;
  window.DiscoveryApi = Object.freeze({ url, path, fetch: publicFetch });
})();
