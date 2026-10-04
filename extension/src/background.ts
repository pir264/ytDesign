// Fetches search suggestions for the content script; the suggest service has no CORS headers
// for youtube.com, but extension pages may fetch it thanks to host_permissions.

declare const browser: any;

browser.runtime.onMessage.addListener((msg: { type: string; query: string }) => {
  if (msg?.type !== 'suggest') return undefined;
  const lang = (navigator.language || 'en').split('-')[0];
  const url = `https://suggestqueries-clients6.youtube.com/complete/search?client=firefox&ds=yt&hl=${lang}&q=${encodeURIComponent(msg.query)}`;
  return fetch(url)
    .then((r) => r.json())
    .then((j) => (Array.isArray(j?.[1]) ? (j[1] as string[]).slice(0, 6) : []))
    .catch(() => []);
});
