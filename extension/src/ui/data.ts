// Cached, paginated data for screens. The cache survives screen switches, so coming back
// (e.g. from the player) shows the same tiles immediately.

import { useEffect, useState } from 'preact/hooks';
import type { Item, Page } from '../data/parse';

interface Entry {
  items: Item[];
  continuation?: string;
  loading: boolean;
  error?: string;
  loadedAt: number;
  extra?: any;
  promise?: Promise<void>;
}

const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const TTL = 10 * 60 * 1000;

function emit(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

/** Drop cached data whose key starts with prefix; it reloads next time it is shown. */
export function invalidate(prefix: string) {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.get(k)!.loadedAt = 0;
}

export type Loader = (continuation?: string) => Promise<Page & { extra?: any }>;

function load(key: string, loader: Loader, more: boolean) {
  const prev = cache.get(key);
  if (prev?.promise) return prev.promise;
  if (more && !prev?.continuation) return;
  const entry: Entry = prev
    ? { ...prev, loading: true, error: undefined }
    : { items: [], loading: true, loadedAt: 0 };
  cache.set(key, entry);
  emit(key);
  const promise = loader(more ? prev!.continuation : undefined)
    .then((page) => {
      const seen = new Set(more ? entry.items.map((i) => i.kind + i.id) : []);
      const fresh = page.items.filter((i) => !seen.has(i.kind + i.id));
      cache.set(key, {
        items: more ? [...entry.items, ...fresh] : page.items,
        continuation: page.continuation,
        loading: false,
        loadedAt: Date.now(),
        extra: more ? entry.extra : page.extra,
      });
    })
    .catch((err: Error) => {
      cache.set(key, {
        ...entry,
        promise: undefined,
        loading: false,
        error: err.message || 'Something went wrong',
        loadedAt: Date.now(),
      });
    })
    .finally(() => emit(key));
  entry.promise = promise;
  return promise;
}

export interface Feed {
  items: Item[];
  loading: boolean;
  error?: string;
  extra?: any;
  hasMore: boolean;
  more(): void;
  reload(): void;
}

export function useFeed(key: string, loader: Loader, enabled = true): Feed {
  const [, force] = useState(0);
  useEffect(() => {
    const set = listeners.get(key) ?? new Set();
    listeners.set(key, set);
    const l = () => force((n) => n + 1);
    set.add(l);
    const entry = cache.get(key);
    if (enabled && (!entry || (!entry.loading && Date.now() - entry.loadedAt > TTL))) load(key, loader, false);
    return () => set.delete(l);
  }, [key, enabled]);
  const entry = cache.get(key);
  return {
    items: entry?.items ?? [],
    loading: entry?.loading ?? enabled,
    error: entry?.error,
    extra: entry?.extra,
    hasMore: !!entry?.continuation,
    more: () => load(key, loader, true),
    reload: () => load(key, loader, false),
  };
}

/** One-off async value (details panel, channel list). */
export function useAsync<T>(key: string | null, fn: () => Promise<T>): { data?: T; error?: string; loading: boolean } {
  const [state, setState] = useState<{ key: string | null; data?: T; error?: string }>({ key: null });
  useEffect(() => {
    if (!key) return;
    let alive = true;
    setState({ key });
    fn().then(
      (data) => alive && setState({ key, data }),
      (e: Error) => alive && setState({ key, error: e.message }),
    );
    return () => {
      alive = false;
    };
  }, [key]);
  const mine = state.key === key;
  return { data: mine ? state.data : undefined, error: mine ? state.error : undefined, loading: !!key && (!mine || (!state.data && !state.error)) };
}
