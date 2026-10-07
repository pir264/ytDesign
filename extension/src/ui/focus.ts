// Virtual focus: exactly one element (by data-fid) is "focused" per screen. Arrow keys move it
// spatially, picking the nearest element in that direction. Elements may belong to a zone
// (data-zone); entering a zone again returns to the element that was focused there last.

import { currentKey, getState, setState } from './store';

export type Dir = 'up' | 'down' | 'left' | 'right';

let root: ParentNode | null = null;

export function setFocusRoot(r: ParentNode) {
  root = r;
}

export function focusables(): HTMLElement[] {
  return root ? [...root.querySelectorAll<HTMLElement>('[data-fid]')] : [];
}

export function elementFor(fid: string | undefined): HTMLElement | null {
  if (!fid || !root) return null;
  return root.querySelector<HTMLElement>(`[data-fid="${CSS.escape(fid)}"]`);
}

export function focusedFid(): string | undefined {
  return getState().focus[currentKey()];
}

/** Screens whose current focus was picked automatically (not by the user). */
const autoKeys = new Set<string>();
/** Focus restored from a previous visit whose element has not rendered yet. */
const wanted = new Map<string, string>();

export function setFocus(fid: string, auto = false) {
  const key = currentKey();
  if (auto) autoKeys.add(key);
  else {
    autoKeys.delete(key);
    wanted.delete(key);
  }
  const el = elementFor(fid);
  const zone = el?.dataset.zone;
  const index = el?.dataset.index;
  setState((s) => ({
    focus: { ...s.focus, [key]: fid },
    pos: zone && index != null && !auto ? { ...s.pos, [key]: { zone, index: Number(index) } } : s.pos,
    // Only what the user chose counts as "where I was" in a zone.
    zones: zone && !auto ? { ...s.zones, [key + '|' + zone]: fid } : s.zones,
  }));
}

/** Remembered element for a zone on the current screen. */
export function zoneMemory(zone: string): string | undefined {
  return getState().zones[currentKey() + '|' + zone];
}

const defaultElement = () => focusables().find((e) => e.dataset.default != null);

/**
 * Make sure something sensible is focused after a screen renders or its content changes:
 * restore the remembered element once it exists, otherwise use the screen's default element
 * (data-default), otherwise the first focusable one.
 */
export function ensureFocus() {
  const key = currentKey();
  const fid = focusedFid();
  const el = elementFor(fid);
  if (fid && !el && !autoKeys.has(key)) wanted.set(key, fid);

  const want = wanted.get(key);
  if (want && elementFor(want)) {
    wanted.delete(key);
    if (want !== fid || autoKeys.has(key)) setFocus(want);
    return;
  }
  // The remembered video is not in its row any more (e.g. watched to the end): once that row has
  // loaded, take the video now at its place.
  const pos = getState().pos[key];
  if (want && pos) {
    const zone = focusables().filter((e) => e.dataset.zone === pos.zone && e.dataset.index != null);
    const near = zone[Math.min(pos.index, zone.length - 1)];
    if (near?.dataset.fid) {
      wanted.delete(key);
      setFocus(near.dataset.fid);
      return;
    }
  }
  const def = defaultElement();
  if (el && (!autoKeys.has(key) || !def || def === el)) return;
  const pick = def ?? focusables()[0];
  if (pick?.dataset.fid && pick !== el) setFocus(pick.dataset.fid, true);
}

export function move(dir: Dir): boolean {
  const all = focusables();
  const cur = elementFor(focusedFid());
  if (!cur) {
    ensureFocus();
    return true;
  }
  const r = cur.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const el of all) {
    if (el === cur) continue;
    const c = el.getBoundingClientRect();
    if (!c.width && !c.height) continue;
    const ccx = c.left + c.width / 2;
    const ccy = c.top + c.height / 2;
    let primary: number;
    let secondary: number;
    if (dir === 'left' || dir === 'right') {
      // Candidates must lie clearly beyond the current element (a focused tile is scaled up,
      // so allow only a little overlap).
      const tol = Math.min(r.width, c.width) * 0.3;
      if (dir === 'right' ? c.left < r.right - tol || ccx <= cx : c.right > r.left + tol || ccx >= cx) continue;
      primary = dir === 'right' ? Math.max(0, c.left - r.right) : Math.max(0, r.left - c.right);
      const overlap = Math.min(c.bottom, r.bottom) - Math.max(c.top, r.top);
      secondary = overlap > 0 ? 0 : Math.abs(ccy - cy);
      // strongly prefer staying on the same line
      primary += secondary * 4;
    } else {
      const tol = Math.min(r.height, c.height) * 0.3;
      if (dir === 'down' ? c.top < r.bottom - tol || ccy <= cy : c.bottom > r.top + tol || ccy >= cy) continue;
      primary = dir === 'down' ? Math.max(0, c.top - r.bottom) : Math.max(0, r.top - c.bottom);
      const overlap = Math.min(c.right, r.right) - Math.max(c.left, r.left);
      secondary = overlap > 0 ? Math.abs(c.left - r.left) * 0.25 : Math.abs(ccx - cx);
      primary = primary * 2 + secondary;
    }
    if (primary < bestScore) {
      bestScore = primary;
      best = el;
    }
  }
  if (!best) return false;

  // Entering another zone: go back to where we were in it.
  const zone = best.dataset.zone;
  if (zone && zone !== cur.dataset.zone) {
    const remembered = elementFor(zoneMemory(zone));
    if (remembered) best = remembered;
  }
  setFocus(best.dataset.fid!);
  return true;
}
