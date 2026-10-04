// Details side panel in the player: channel, description and the comment tree. Everything can be
// scrolled and expanded with the D-pad; it is read-only.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { api } from '../../data/api';
import type { Comment } from '../../data/parse';
import { cls, Icon, useFocused } from '../components';
import { useAsync } from '../data';
import { elementFor, focusedFid, setFocus } from '../focus';
import type { Action } from '../input';
import { openChannel } from '../nav';
import { setState } from '../store';

let panelEl: HTMLElement | null = null;
let scrollEl: HTMLElement | null = null;

export function setDetails(open: boolean) {
  setState({ detailsOpen: open });
  setFocus(open ? 'd-close' : 'details');
}

/** Scroll the panel so `el` is in view; a tall element shows its start (going down) or end (going up). */
function reveal(el: HTMLElement, dir: 'up' | 'down' | 'start') {
  const box = scrollEl;
  if (!box || !box.contains(el)) return;
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const scale = box.clientHeight / b.height; // screen px → canvas px
  const margin = 24 / scale;
  let delta = 0;
  if (dir === 'start') {
    // only make sure the start is visible
    if (r.top < b.top) box.scrollBy({ top: (r.top - b.top - margin) * scale, behavior: 'smooth' });
    return;
  }
  if (r.top >= b.top && r.bottom <= b.bottom) return;
  const tall = r.height > b.height - 2 * margin;
  if (dir === 'down') delta = tall || r.top < b.top ? r.top - b.top - margin : r.bottom - b.bottom + margin;
  else delta = tall || r.bottom > b.bottom ? r.bottom - b.bottom + margin : r.top - b.top - margin;
  box.scrollBy({ top: delta * scale, behavior: 'smooth' });
}

/**
 * Keys while the focus is inside the panel: up/down first scroll through a focused element that is
 * taller than the panel, then move through the panel's items in reading order.
 */
export function panelKey(a: Action, wheel: boolean): boolean {
  if (!panelEl || !scrollEl) return false;
  if (wheel && (a === 'up' || a === 'down')) {
    scrollEl.scrollBy({ top: (a === 'down' ? 1 : -1) * scrollEl.clientHeight * 0.3, behavior: 'smooth' });
    return true;
  }
  const el = elementFor(focusedFid());
  if (!el || !panelEl.contains(el)) return false;
  if (a === 'left' || a === 'right') return true;
  if (a !== 'up' && a !== 'down') return false;

  if (scrollEl.contains(el)) {
    const b = scrollEl.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const step = scrollEl.clientHeight * 0.6;
    if (a === 'down' && r.bottom > b.bottom + 4) {
      scrollEl.scrollBy({ top: step, behavior: 'smooth' });
      return true;
    }
    if (a === 'up' && r.top < b.top - 4) {
      scrollEl.scrollBy({ top: -step, behavior: 'smooth' });
      return true;
    }
  }
  const all = [...panelEl.querySelectorAll<HTMLElement>('[data-fid]')];
  const next = all[all.indexOf(el) + (a === 'down' ? 1 : -1)];
  if (next?.dataset.fid) {
    setFocus(next.dataset.fid);
    reveal(next, a);
  }
  return true;
}

/** Text cut off after `lines` lines; shows "Show more" when there is more to read. */
function Clamp({ text, lines, open, class: className }: { text: string; lines: 3 | 5; open: boolean; class: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setOverflows(el.scrollHeight > el.clientHeight + 2);
  }, [text, open]);
  return (
    <>
      <div ref={ref} class={cls(className, !open && 'clamp-' + lines)}>
        {text}
      </div>
      {overflows && <div class="d-more">{open ? 'Show less' : 'Show more'}</div>}
    </>
  );
}

interface Replies {
  open: boolean;
  loading: boolean;
  items: Comment[];
  next?: string;
}

interface Thread {
  count?: string;
  comments: Comment[];
  next?: string;
  loading: boolean;
  error?: boolean;
}

export function DetailsPanel({ videoId }: { videoId: string }) {
  const f = useFocused();
  const details = useAsync('details:' + videoId, () => api.details(videoId));
  const token = details.data?.commentsToken;
  const [thread, setThread] = useState<Thread>({ comments: [], loading: false });
  const [replies, setReplies] = useState<Record<string, Replies>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const panel = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const loadingMore = useRef(false);

  useEffect(() => {
    panelEl = panel.current;
    scrollEl = scroller.current;
    return () => {
      panelEl = scrollEl = null;
    };
  }, []);

  const loadComments = async (tok: string, append: boolean) => {
    if (loadingMore.current) return;
    loadingMore.current = true;
    setThread((t) => ({ ...t, loading: true }));
    try {
      const page = await api.comments(tok);
      setThread((t) => {
        const seen = new Set(t.comments.map((c) => c.id));
        return {
          count: t.count ?? page.count,
          comments: append ? [...t.comments, ...page.comments.filter((c) => !seen.has(c.id))] : page.comments,
          next: page.next,
          loading: false,
        };
      });
    } catch {
      setThread((t) => ({ ...t, loading: false, error: true }));
    } finally {
      loadingMore.current = false;
    }
  };

  useEffect(() => {
    if (token) void loadComments(token, false);
  }, [token]);

  // Keep loading while the focus gets near the end of the list.
  useEffect(() => {
    if (!f?.startsWith('c:') || !thread.next) return;
    const idx = thread.comments.findIndex((c) => 'c:' + c.id === f);
    if (idx >= thread.comments.length - 4) void loadComments(thread.next, true);
  }, [f, thread.comments.length, thread.next]);

  const toggle = (fid: string) => {
    setFocus(fid);
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(fid)) n.delete(fid);
      else n.add(fid);
      return n;
    });
    // Collapsing a long text can leave its start above the visible area.
    setTimeout(() => {
      const el = elementFor(fid);
      if (el) reveal(el, 'start');
    }, 50);
  };

  const loadReplies = async (c: Comment, more: boolean) => {
    const cur = replies[c.id];
    const tok = more ? cur?.next : c.repliesToken;
    if (!tok) return;
    setReplies((r) => ({ ...r, [c.id]: { items: cur?.items ?? [], next: cur?.next, open: true, loading: true } }));
    try {
      const page = await api.comments(tok);
      setReplies((r) => ({
        ...r,
        [c.id]: { open: true, loading: false, next: page.next, items: [...(more ? r[c.id]?.items ?? [] : []), ...page.comments] },
      }));
    } catch {
      setReplies((r) => ({ ...r, [c.id]: { ...r[c.id], loading: false } }));
    }
  };

  const toggleReplies = (c: Comment) => {
    setFocus('r:' + c.id);
    const cur = replies[c.id];
    if (cur?.open) setReplies((r) => ({ ...r, [c.id]: { ...cur, open: false } }));
    else if (cur?.items.length) setReplies((r) => ({ ...r, [c.id]: { ...cur, open: true } }));
    else void loadReplies(c, false);
  };

  const ch = details.data?.channel;
  const descFid = 'd-desc';
  const meta = [details.data?.views, details.data?.date].filter(Boolean).join(' · ');

  const renderComment = (c: Comment, reply: boolean) => {
    const fid = (reply ? 'rc:' : 'c:') + c.id;
    return (
      <button
        key={fid}
        class={cls('d-comment', reply && 'reply', f === fid && 'focused')}
        data-fid={fid}
        onClick={() => toggle(fid)}
      >
        <div class="avatar small">{c.avatar ? <img src={c.avatar} alt="" /> : c.author.replace('@', '').charAt(0)}</div>
        <div class="d-c-body">
          <div class="d-c-name">
            {c.author}
            {c.published && <span> · {c.published}</span>}
          </div>
          <Clamp class="d-c-text" text={c.text} lines={3} open={open.has(fid)} />
          {c.likes && c.likes !== '0' && <div class="d-c-likes">{c.likes} likes</div>}
        </div>
      </button>
    );
  };

  return (
    <aside class="d-panel" aria-label="Video details" ref={panel} data-manual-scroll="">
      <div class="d-head">
        <h2>Details</h2>
        <button class={cls('d-x', f === 'd-close' && 'focused')} data-fid="d-close" aria-label="Close details" onClick={() => setDetails(false)}>
          {Icon.close(28)}
        </button>
      </div>
      <div class="d-scroll" ref={scroller}>
        {details.loading && <div class="quiet">Loading…</div>}
        {details.error && <div class="quiet">Couldn't load details.</div>}
        {ch && (
          <div class="d-channel">
            <div class="avatar">{ch.avatar ? <img src={ch.avatar} alt="" /> : ch.name.charAt(0)}</div>
            <div class="d-ch-text">
              <div class="d-ch-name">{ch.name}</div>
              {ch.subscribers && <div class="d-ch-subs">{ch.subscribers}</div>}
            </div>
            <button class={cls('d-go', f === 'd-channel' && 'focused')} data-fid="d-channel" onClick={() => openChannel(ch.id, ch.name)}>
              Go to channel
            </button>
          </div>
        )}
        {details.data && (
          <>
            <button class={cls('d-desc-box', f === descFid && 'focused')} data-fid={descFid} onClick={() => toggle(descFid)}>
              {meta && <div class="d-desc-meta">{meta}</div>}
              <Clamp class="d-desc" text={details.data.description || 'No description.'} lines={5} open={open.has(descFid)} />
            </button>
            <div class="d-rule" />
            <div class="d-comments-h">
              Comments {thread.count && <span>· {thread.count}</span>}
            </div>
            <div class="d-comments">
              {thread.comments.map((c) => {
                const r = replies[c.id];
                const rfid = 'r:' + c.id;
                return (
                  <div class="d-thread" key={c.id}>
                    {renderComment(c, false)}
                    {c.repliesToken && (
                      <button class={cls('d-replies', f === rfid && 'focused')} data-fid={rfid} onClick={() => toggleReplies(c)}>
                        {r?.open ? '▾ Hide replies' : `▸ ${c.replyCount ?? ''} ${c.replyCount === 1 ? 'reply' : 'replies'}`}
                      </button>
                    )}
                    {r?.open && (
                      <div class="d-reply-list">
                        {r.items.map((rc) => renderComment(rc, true))}
                        {r.loading && <div class="quiet small">Loading replies…</div>}
                        {!r.loading && r.next && (
                          <button
                            class={cls('d-replies', f === 'rm:' + c.id && 'focused')}
                            data-fid={'rm:' + c.id}
                            onClick={() => void loadReplies(c, true)}
                          >
                            ▸ Show more replies
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {thread.loading && <div class="quiet">Loading comments…</div>}
              {thread.error && !thread.comments.length && <div class="quiet">Couldn't load comments.</div>}
              {!token && !details.loading && <div class="quiet">Comments are turned off.</div>}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
