import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { api } from '../data/api';
import type { Item } from '../data/parse';
import { setFocus } from './focus';
import { go, openSearch, play, refresh } from './nav';
import { current, routeKey, useStore, type Screen } from './store';

export const SURFACES = ['#1d4180', '#2b569c', '#0f2450', '#143062'];

/** Focus id for a tile: tied to the video or playlist, not to its position, so it survives reordering. */
export function itemFid(prefix: string, item: Item): string {
  return `${prefix}:${item.kind === 'playlist' ? 'p' : 'v'}${item.id}`;
}

export function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/** Focused element id on the current screen. */
export function useFocused(): string | undefined {
  return useStore((s) => s.focus[routeKey(s.stack[s.stack.length - 1])]);
}

// ---------- icons ----------

export const Icon = {
  search: (size = 28) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  close: (size = 32) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  play: (size = 52) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  pause: (size = 52) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  ),
  rewind: () => (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  ),
  forward: () => (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  ),
  back: () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  ),
  info: () => (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 11v6M12 7.5v.5" />
    </svg>
  ),
  playlist: (size = 64) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 6h12M3 12h12M3 18h8M17 14v7l5-3.5z" />
    </svg>
  ),
};

// ---------- top bar ----------

const NAV: { id: Exclude<Screen, 'search' | 'results' | 'channel' | 'player'>; label: string; d: string }[] = [
  { id: 'home', label: 'Home', d: 'M3 11l9-7 9 7M5 10v10h14V10' },
  { id: 'history', label: 'History', d: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 7v5l3 2' },
  { id: 'playlists', label: 'Playlists', d: 'M3 6h12M3 12h12M3 18h8M17 14v7l5-3.5z' },
  { id: 'subs', label: 'Subscriptions', d: 'M3 5h18v12H3zM10 8.5l5 2.5-5 2.5zM8 21h8' },
];

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  return <div class="clock">{now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</div>;
}

export function TopBar({ active }: { active?: Screen }) {
  const f = useFocused();
  return (
    <div class="topbar">
      <button
        class={cls('pill-search', f === 'top:search' && 'focused')}
        data-fid="top:search"
        data-zone="top"
        aria-label="Search (press S)"
        onClick={() => openSearch()}
      >
        {Icon.search()}
        <span>Search</span>
        <span class="key">S</span>
      </button>
      <nav class="nav" aria-label="Library">
        {NAV.map((n) => (
          <button
            key={n.id}
            class={cls(active === n.id && 'active', f === 'top:' + n.id && 'focused')}
            data-fid={'top:' + n.id}
            data-zone="top"
            onClick={() => (current().screen === n.id ? refresh() : go(n.id, 'top:' + n.id))}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d={n.d} />
            </svg>
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      <Clock />
    </div>
  );
}

// ---------- tiles ----------

export interface TileProps {
  item: Item;
  index: number;
  fid: string;
  zone: string;
  focused: boolean;
  meta?: string;
  isDefault?: boolean;
  /** home rows align the whole row to the top when focused */
  row?: boolean;
}

export function Tile({ item, index, fid, zone, focused, meta, isDefault, row }: TileProps) {
  const badge = item.kind === 'video' ? item.duration : item.count;
  const progress = item.kind === 'video' ? item.progress : undefined;
  return (
    <button
      class={cls('tile', focused && 'focused')}
      data-fid={fid}
      data-zone={zone}
      data-index={index}
      data-default={isDefault ? '' : undefined}
      data-block={row ? 'start' : undefined}
      onClick={() => {
        setFocus(fid);
        void play(item);
      }}
    >
      <div class="thumb" style={{ background: SURFACES[index % SURFACES.length] }}>
        {item.thumb ? <img src={item.thumb} alt="" loading="lazy" decoding="async" /> : item.kind === 'playlist' && Icon.playlist()}
        {badge && <span class="badge">{badge}</span>}
        {progress ? (
          <div class="prog">
            <div style={{ width: Math.min(100, progress) + '%' }} />
          </div>
        ) : null}
      </div>
      <div class="t-body">
        <div class="t-title">{item.title}</div>
        {meta && <div class="t-meta">{meta}</div>}
      </div>
    </button>
  );
}

export function Grid({
  items,
  focused,
  metaFor,
  hasMore,
  more,
}: {
  items: Item[];
  focused?: string;
  metaFor?: (i: Item) => string | undefined;
  hasMore?: boolean;
  more?: () => void;
}) {
  const idx = items.findIndex((item) => itemFid('grid', item) === focused);
  useEffect(() => {
    // Load the next page while the user is still a couple of rows away from the end.
    if (hasMore && more && idx >= items.length - 8) more();
  }, [idx, items.length, hasMore]);
  return (
    <div class="grid">
      {items.map((item, i) => (
        <Tile
          key={item.kind + item.id}
          item={item}
          index={i}
          fid={itemFid('grid', item)}
          zone="grid"
          focused={focused === itemFid('grid', item)}
          meta={metaFor?.(item)}
          isDefault={i === 0}
        />
      ))}
    </div>
  );
}

/** Loading / error / empty placeholder for a list area. */
export function Status({
  loading,
  error,
  empty,
  retry,
  children,
}: {
  loading: boolean;
  error?: string;
  empty: boolean;
  retry?: () => void;
  children?: ComponentChildren;
}) {
  const f = useFocused();
  if (error && empty)
    return (
      <div class="status">
        <div>Couldn't load this. {error}</div>
        {retry && (
          <button class={cls('btn', f === 'retry' && 'focused')} data-fid="retry" data-default="" onClick={retry}>
            Try again
          </button>
        )}
      </div>
    );
  if (loading && empty) return <div class="status quiet">Loading…</div>;
  if (empty) return <div class="status quiet">{children ?? 'Nothing here yet.'}</div>;
  return null;
}

/** Channel · upload date · duration · % watched, for the details block above a row or grid. */
export function videoMeta(item: Item | undefined, extra?: { channel?: string; date?: string }): string[] {
  if (!item) return [];
  if (item.kind === 'playlist') return [item.count, item.meta].filter(Boolean) as string[];
  return [
    item.channel || extra?.channel,
    item.published || extra?.date,
    item.duration,
    item.progress ? `${Math.round(item.progress)}% watched` : undefined,
  ].filter(Boolean) as string[];
}

/**
 * videoMeta for the focused tile. Feeds like History often leave out the channel or the upload date;
 * when the focus rests on such a video, they are fetched from the video's details (once per video).
 */
export function useVideoMeta(item: Item | undefined): string[] {
  const [extra, setExtra] = useState<{ id: string; channel?: string; date?: string } | null>(null);
  const missing = item?.kind === 'video' && (!item.channel || !item.published) ? item.id : null;
  useEffect(() => {
    if (!missing) return;
    let alive = true;
    const t = setTimeout(() => {
      api.details(missing).then(
        (d) => alive && setExtra({ id: missing, channel: d.channel?.name, date: d.date }),
        () => {},
      );
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [missing]);
  return videoMeta(item, extra && extra.id === item?.id ? extra : undefined);
}

