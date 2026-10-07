// Screen navigation, following the Back table in DESIGN.md.

import { api } from '../data/api';
import type { Item } from '../data/parse';
import { invalidate } from './data';
import { setFocus } from './focus';
import { current, getState, routeKey, setState, toast, type Route, type Screen } from './store';

declare const browser: any;

const RECENT_KEY = 'recentSearches';

function setStack(stack: Route[]) {
  setState({ stack, detailsOpen: false });
}

export function go(screen: Exclude<Screen, 'search' | 'results' | 'channel' | 'player'>, focus?: string) {
  setStack(screen === 'home' ? [{ screen: 'home' }] : [{ screen: 'home' }, { screen }]);
  // Chosen from the top bar: keep the focus on that tab, so ← → can go on to the next one.
  if (focus) setFocus(focus);
}

/** Data each screen shows, by cache key prefix. */
const FEEDS: Partial<Record<Screen, string[]>> = {
  home: ['home:'],
  history: ['history'],
  playlists: ['playlists'],
  subs: ['subs'],
};

/** Reload the current screen, like F5 but without reloading YouTube underneath. */
export function refresh() {
  const route = current();
  const key = routeKey(route);
  for (const prefix of FEEDS[route.screen] ?? []) invalidate(prefix);
  if (route.screen === 'results') invalidate('results:' + route.q);
  if (route.screen === 'channel') invalidate('channel:' + route.channelId);
  // Start at the top again: forget the remembered tiles, but keep the focus where it is (top bar).
  setState((s) => ({
    refresh: s.refresh + 1,
    zones: Object.fromEntries(Object.entries(s.zones).filter(([k]) => !k.startsWith(key + '|') || k.endsWith('|top'))),
  }));
  toast('Refreshed');
}

export function openSearch() {
  const cur = current();
  if (cur.screen === 'search' || cur.screen === 'player') return;
  const q = cur.screen === 'results' ? cur.q : '';
  setStack([...getState().stack, { screen: 'search', from: cur.screen, q }]);
}

export function showResults(q: string) {
  q = q.trim();
  if (!q) return;
  void saveRecent(q);
  setStack([{ screen: 'home' }, { screen: 'results', q }]);
}

export function openChannel(channelId: string, channelName?: string) {
  if (!channelId) return;
  setStack([...getState().stack, { screen: 'channel', channelId, channelName }]);
}

export async function play(item: Item) {
  if (item.kind === 'video') {
    // Without an explicit start time YouTube resumes partially watched videos by itself.
    setStack([
      ...getState().stack,
      { screen: 'player', video: item, play: { videoId: item.id, startTimeSeconds: item.startTime } },
    ]);
    return;
  }
  // Playlist: start at its first video.
  let videoId = item.firstVideoId;
  if (!videoId) {
    try {
      videoId = await api.playlistFirstVideo(item.id);
    } catch {
      /* handled below */
    }
  }
  if (!videoId) {
    toast('This playlist is empty');
    return;
  }
  setStack([
    ...getState().stack,
    {
      screen: 'player',
      video: { kind: 'video', id: videoId, title: item.title, thumb: item.thumb },
      play: { videoId, playlistId: item.id, index: 0 },
    },
  ]);
}

export function back() {
  const { stack, detailsOpen } = getState();
  const cur = stack[stack.length - 1];
  switch (cur.screen) {
    case 'home':
      return;
    case 'player':
      if (detailsOpen) {
        setState({ detailsOpen: false });
        return;
      }
      // Watch progress changed: refresh rows that show it.
      invalidate('home:history');
      invalidate('history');
      setStack(stack.slice(0, -1));
      return;
    case 'search':
    case 'channel':
      setStack(stack.length > 1 ? stack.slice(0, -1) : [{ screen: 'home' }]);
      return;
    default:
      go('home');
  }
}

export async function recentSearches(): Promise<string[]> {
  try {
    return (await browser.storage.local.get(RECENT_KEY))[RECENT_KEY] ?? [];
  } catch {
    return [];
  }
}

async function saveRecent(q: string) {
  const list = (await recentSearches()).filter((s) => s.toLowerCase() !== q.toLowerCase());
  try {
    await browser.storage.local.set({ [RECENT_KEY]: [q, ...list].slice(0, 8) });
  } catch {
    /* ignore */
  }
}
