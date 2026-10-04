import { useEffect, useState } from 'preact/hooks';
import type { Video } from '../data/parse';
import type { PlayerStatus, PlayRequest } from '../shared/protocol';

export type Screen = 'home' | 'search' | 'results' | 'history' | 'playlists' | 'subs' | 'channel' | 'player';

export interface Route {
  screen: Screen;
  /** search query (search, results) */
  q?: string;
  /** search: the screen search was opened from */
  from?: Screen;
  channelId?: string;
  channelName?: string;
  /** player: what to play and what we know about it already */
  play?: PlayRequest;
  video?: Video;
}

export interface State {
  stack: Route[];
  /** focused element per route key */
  focus: Record<string, string>;
  /** last focused element per route key + zone, to come back to the same tile */
  zones: Record<string, string>;
  player: PlayerStatus | null;
  detailsOpen: boolean;
  toast: string | null;
  /** epoch ms of the last key press / real mouse move */
  activity: number;
  cursorHidden: boolean;
  /** null until the bridge reported the YouTube session */
  loggedIn: boolean | null;
}

export function routeKey(r: Route): string {
  switch (r.screen) {
    case 'results':
      return 'results:' + r.q;
    case 'channel':
      return 'channel:' + r.channelId;
    default:
      return r.screen;
  }
}

const STORAGE_KEY = 'yttv-state';

function restore(): Partial<State> {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && Array.isArray(saved.stack) && saved.stack.length) return saved;
  } catch {
    /* ignore */
  }
  return {};
}

let state: State = {
  stack: [{ screen: 'home' }],
  focus: {},
  zones: {},
  player: null,
  detailsOpen: false,
  toast: null,
  activity: Date.now(),
  cursorHidden: false,
  loggedIn: null,
  ...restore(),
};

const listeners = new Set<() => void>();

export function getState(): State {
  return state;
}

export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  if ('stack' in p || 'focus' in p || 'zones' in p) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ stack: state.stack, focus: state.focus, zones: state.zones }));
    } catch {
      /* storage full or blocked */
    }
  }
  for (const l of listeners) l();
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useStore<T>(select: (s: State) => T): T {
  const [value, setValue] = useState(() => select(state));
  useEffect(() => {
    const check = () => setValue(() => select(state));
    check();
    return subscribe(check);
  }, []);
  return value;
}

export const current = () => state.stack[state.stack.length - 1];
export const currentKey = () => routeKey(current());

let toastTimer = 0;
export function toast(message: string) {
  clearTimeout(toastTimer);
  setState({ toast: message });
  toastTimer = window.setTimeout(() => setState({ toast: null }), 2200);
}
