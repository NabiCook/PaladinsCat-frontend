/* Public data transport shared by native views and the compiled dashboard widgets. */
(() => {
  'use strict';
  if (window.DiscoveryApi) return;
  const originalFetch = window.fetch.bind(window);

  function url(input, method = 'GET') {
    const value = new URL(input, location.href);
    if (value.origin !== location.origin || !/^\/(?:api|_pc)(?:\/|$)/.test(value.pathname)) return value.href;
    const explicitV1 = /^\/api\/v1(?:\/|$)/.test(value.pathname);
    const path = value.pathname.replace(/^\/(?:api|_pc)(?:\/v1)?(?=\/|$)/, '') || '/';
    const read = ['GET', 'HEAD'].includes(String(method).toUpperCase());
    const acquisition = [...value.searchParams].some(([key, flag]) => ['remote', 'refresh'].includes(key) && /^(true|1)$/i.test(flag));
    // The browser app is a guest website client: developer-v1 reads require an
    // API key and answer 401 to a session cookie, so every read goes to the
    // session-backed `/api` contract unless the caller asked for /api/v1
    // explicitly. Non-reads (and remote/refresh acquisitions) always do.
    const website = !read || acquisition || !explicitV1;
    value.pathname = (website ? '/api' : '/api/v1') + path;
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
