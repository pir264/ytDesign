// Runs in the page's MAIN world, so it can read ytcfg, call InnerTube with the
// signed-in session and drive YouTube's own player (#movie_player).

import { TAG, type BridgeMethods, type PlayRequest, type PlayerStatus, type Request } from '../shared/protocol';

declare global {
  interface Window {
    ytcfg?: { get(key: string): any };
  }
}

interface YTPlayer extends HTMLElement {
  getVideoData(): { video_id: string; title: string; author: string; isLive?: boolean };
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getPlaylistId?(): string | null;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  toggleSubtitles?(): void;
  getOption?(module: string, option: string): any;
  loadModule?(module: string): void;
}

const ORIGIN = 'https://www.youtube.com';
let active = false;
let pollTimer = 0;
let mutedForAd = false;

const cfg = (key: string) => window.ytcfg?.get?.(key);
const player = () => document.getElementById('movie_player') as YTPlayer | null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => T | null | undefined | false, timeout = 10000, step = 100): Promise<T | null> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(step);
  }
  return null;
}

function cookie(name: string): string | undefined {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : undefined;
}

async function sha1(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function authorization(): Promise<string | undefined> {
  const ts = Math.floor(Date.now() / 1000);
  const parts: string[] = [];
  for (const [c, label] of [
    ['SAPISID', 'SAPISIDHASH'],
    ['__Secure-1PAPISID', 'SAPISID1PHASH'],
    ['__Secure-3PAPISID', 'SAPISID3PHASH'],
  ]) {
    const v = cookie(c);
    if (v) parts.push(`${label} ${ts}_${await sha1(`${ts} ${v} ${ORIGIN}`)}`);
  }
  return parts.length ? parts.join(' ') : undefined;
}

async function api(endpoint: string, body: Record<string, unknown>): Promise<string> {
  await waitFor(() => cfg('INNERTUBE_CONTEXT'));
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Origin': ORIGIN,
    'X-Goog-AuthUser': String(cfg('SESSION_INDEX') ?? 0),
  };
  const clientName = cfg('INNERTUBE_CONTEXT_CLIENT_NAME');
  const clientVersion = cfg('INNERTUBE_CLIENT_VERSION');
  const visitor = cfg('VISITOR_DATA');
  const pageId = cfg('DELEGATED_SESSION_ID');
  if (clientName) headers['X-Youtube-Client-Name'] = String(clientName);
  if (clientVersion) headers['X-Youtube-Client-Version'] = String(clientVersion);
  if (visitor) headers['X-Goog-Visitor-Id'] = String(visitor);
  if (pageId) headers['X-Goog-PageId'] = String(pageId);
  const auth = await authorization();
  if (auth) headers['Authorization'] = auth;

  const key = cfg('INNERTUBE_API_KEY');
  const url = `/youtubei/v1/${endpoint}?prettyPrint=false${key ? '&key=' + encodeURIComponent(key) : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({ context: cfg('INNERTUBE_CONTEXT'), ...body }),
  });
  if (!res.ok) throw new Error(`InnerTube ${endpoint}: HTTP ${res.status}`);
  return res.text();
}

function watchUrl(req: PlayRequest): string {
  let url = `/watch?v=${encodeURIComponent(req.videoId)}`;
  if (req.playlistId) url += `&list=${encodeURIComponent(req.playlistId)}`;
  if (req.index != null) url += `&index=${req.index + 1}`;
  if (req.startTimeSeconds) url += `&t=${Math.floor(req.startTimeSeconds)}s`;
  return url;
}

/** Make the player's ancestors unable to trap position:fixed (transform/contain create a containing block). */
function markAncestors(p: HTMLElement) {
  for (let el = p.parentElement; el && el !== document.body; el = el.parentElement) el.setAttribute('yttv-anc', '');
}

async function play(req: PlayRequest): Promise<boolean> {
  active = true;
  startPolling();
  const p = player();
  if (p && location.pathname === '/watch' && p.getVideoData()?.video_id === req.videoId) {
    p.playVideo();
    return true;
  }

  // Let YouTube's single-page router load the watch page, so history and resume work as usual.
  const watchEndpoint: Record<string, unknown> = { videoId: req.videoId };
  if (req.playlistId) watchEndpoint.playlistId = req.playlistId;
  if (req.index != null) watchEndpoint.index = req.index;
  if (req.startTimeSeconds) watchEndpoint.startTimeSeconds = Math.floor(req.startTimeSeconds);
  const endpoint = {
    commandMetadata: { webCommandMetadata: { url: watchUrl(req), webPageType: 'WEB_PAGE_TYPE_WATCH', rootVe: 3832 } },
    watchEndpoint,
  };
  const app = document.querySelector('ytd-app');
  app?.dispatchEvent(new CustomEvent('yt-navigate', { bubbles: true, composed: true, detail: { endpoint } }));

  const loaded = await waitFor(() => {
    const pl = player();
    return pl && location.pathname === '/watch' && pl.getVideoData?.()?.video_id === req.videoId ? pl : null;
  }, 6000);
  if (!loaded) {
    // SPA navigation did not happen (YouTube changed something); fall back to a full page load.
    // The content script restores its state from sessionStorage after the reload.
    location.assign(watchUrl(req));
    return false;
  }
  markAncestors(loaded);
  window.dispatchEvent(new Event('resize'));
  loaded.playVideo();
  // YouTube sometimes leaves a freshly loaded video unstarted; nudge it once more.
  setTimeout(() => {
    const state = loaded.getPlayerState();
    if (active && (state === -1 || state === 5)) loaded.playVideo();
  }, 1500);
  return true;
}

function status(p: YTPlayer): PlayerStatus {
  const d = p.getVideoData?.() ?? ({} as ReturnType<YTPlayer['getVideoData']>);
  let captions = false;
  try {
    const track = p.getOption?.('captions', 'track');
    captions = !!(track && track.languageCode);
  } catch {
    /* captions module not loaded */
  }
  return {
    videoId: d.video_id ?? '',
    title: d.title ?? '',
    author: d.author ?? '',
    time: p.getCurrentTime?.() ?? 0,
    duration: p.getDuration?.() ?? 0,
    state: p.getPlayerState?.() ?? -1,
    isLive: !!d.isLive,
    ad: p.classList.contains('ad-showing'),
    playlistId: p.getPlaylistId?.() ?? '',
    captions,
  };
}

/** Fallback for when uBlock misses an ad: mute it, skip it, or jump to its end. */
function handleAds(p: YTPlayer) {
  const video = p.querySelector('video');
  if (p.classList.contains('ad-showing')) {
    if (video && !video.muted) {
      video.muted = true;
      mutedForAd = true;
    }
    const skip = p.querySelector<HTMLElement>('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern');
    if (skip) skip.click();
    else if (video && Number.isFinite(video.duration) && video.duration > 0) video.currentTime = video.duration;
  } else if (mutedForAd && video) {
    video.muted = false;
    mutedForAd = false;
  }
}

/** Confirm YouTube's "Video paused. Continue watching?" dialog, which is hidden under our overlay. */
function confirmStillWatching() {
  const dialog = document.querySelector('ytd-popup-container yt-confirm-dialog-renderer');
  if (dialog && (dialog as HTMLElement).offsetParent !== null) {
    dialog.querySelector<HTMLElement>('#confirm-button button, #confirm-button')?.click();
    player()?.playVideo();
  }
}

function tick() {
  const p = player();
  if (!p || !p.getVideoData) return;
  if (!active) {
    // Nothing should play while the TV UI is browsing (e.g. YouTube autoplay after we left the player).
    if (p.getPlayerState() === 1) p.pauseVideo();
    return;
  }
  handleAds(p);
  confirmStillWatching();
  if (!p.hasAttribute('yttv-marked')) {
    p.setAttribute('yttv-marked', '');
    markAncestors(p);
  }
  send({ [TAG]: 'evt', type: 'player', data: status(p) });
}

function startPolling() {
  if (!pollTimer) pollTimer = window.setInterval(tick, 400);
}

const methods: { [K in keyof BridgeMethods]: (...args: Parameters<BridgeMethods[K]>) => any } = {
  api,
  async session() {
    await waitFor(() => cfg('INNERTUBE_CONTEXT'));
    return { loggedIn: !!cfg('LOGGED_IN'), ready: !!cfg('INNERTUBE_CONTEXT') };
  },
  play,
  setActive(a) {
    active = a;
    const p = player();
    if (!a && p?.getPlayerState?.() === 1) p.pauseVideo();
    startPolling();
  },
  toggle() {
    const p = player();
    if (!p) return;
    if (p.getPlayerState() === 1) p.pauseVideo();
    else p.playVideo();
  },
  seekBy(seconds) {
    const p = player();
    if (!p) return;
    p.seekTo(Math.max(0, p.getCurrentTime() + seconds), true);
  },
  async captions() {
    const p = player();
    if (!p) return null;
    const on = () => {
      try {
        return !!p.getOption?.('captions', 'track')?.languageCode;
      } catch {
        return false;
      }
    };
    const before = on();
    if (p.toggleSubtitles) p.toggleSubtitles();
    else p.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', keyCode: 67, bubbles: true }));
    const after = await waitFor(() => on() !== before, 1000);
    if (after === null && !before) return null;
    return on();
  },
};

// Always poll: while inactive the tick only keeps the player paused (YouTube autoplay, previews).
startPolling();

const PREFIX = TAG + ':';
const send = (msg: object) => window.postMessage(PREFIX + JSON.stringify(msg), location.origin);

window.addEventListener('message', async (e) => {
  if (e.source !== window || typeof e.data !== 'string' || !e.data.startsWith(PREFIX)) return;
  const msg = JSON.parse(e.data.slice(PREFIX.length)) as Request;
  if (msg[TAG] !== 'req') return;
  try {
    const fn = methods[msg.method] as (...a: unknown[]) => unknown;
    send({ [TAG]: 'res', id: msg.id, result: await fn(...msg.args) });
  } catch (err) {
    send({ [TAG]: 'res', id: msg.id, error: err instanceof Error ? err.message : String(err) });
  }
});
