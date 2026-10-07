import { useEffect, useRef } from 'preact/hooks';
import { api } from '../../data/api';
import type { Item } from '../../data/parse';
import { cls, Status, Tile, useFocused, videoMeta } from '../components';
import { useFeed } from '../data';
import { useStore } from '../store';

interface Row {
  id: string;
  title: string;
  items: Item[];
  loading: boolean;
  /** recommendation rows after the first "More for you" continue without a heading */
  headless?: boolean;
  /** load the next page of this row's feed */
  more?: () => void;
}

/** Recommendations are one long feed; on the TV it is shown as rows of this many videos. */
const REC_ROW = 12;

export function Home() {
  const loggedIn = useStore((s) => s.loggedIn);
  const f = useFocused();
  const history = useFeed('home:history', api.history, loggedIn === true);
  const subs = useFeed('home:subs', api.subscriptionFeed, loggedIn === true);
  const rec = useFeed('home:rec', api.home, loggedIn !== null);

  const partial = history.items.filter((i) => i.kind === 'video' && i.progress && i.progress < 95);
  const rows: Row[] = [];
  if (loggedIn) {
    const more = history.hasMore ? history.more : undefined;
    if (partial.length) rows.push({ id: 'cw', title: 'Continue watching', items: partial, loading: history.loading, more });
    else if (history.items.length)
      rows.push({ id: 'cw', title: 'Recently watched', items: history.items, loading: history.loading, more });
    rows.push({ id: 'subs', title: 'Subscriptions', items: subs.items, loading: subs.loading, more: subs.hasMore ? subs.more : undefined });
  }
  for (let i = 0; i === 0 || i * REC_ROW < rec.items.length; i++) {
    rows.push({
      id: 'rec' + i,
      title: i === 0 ? 'Recommended' : 'More for you',
      items: rec.items.slice(i * REC_ROW, (i + 1) * REC_ROW),
      loading: rec.loading,
      headless: i > 1,
    });
  }
  const shown = rows.filter((r) => r.items.length);

  // The row that has (or last had) focus; the details block shows its focused tile.
  const lastTile = useRef<string | undefined>(undefined);
  if (f && shown.some((r) => f.startsWith(r.id + ':'))) lastTile.current = f;
  const tileFid = lastTile.current;
  const activeRow = shown.find((r) => tileFid?.startsWith(r.id + ':')) ?? shown[0];
  const focusedItem = activeRow && tileFid ? activeRow.items[Number(tileFid.split(':')[1])] : activeRow?.items[0];

  const loading = rows.some((r) => r.loading) || loggedIn === null;

  // Endless, like YouTube: a row loads more near its right end, and more recommendation rows
  // appear while moving down.
  const activeIndex = shown.indexOf(activeRow);
  const focusIndex = tileFid ? Number(tileFid.split(':')[1]) : 0;
  useEffect(() => {
    if (!activeRow) return;
    if (activeRow.more && focusIndex >= activeRow.items.length - 5) activeRow.more();
    if (rec.hasMore && activeIndex >= shown.length - 2) rec.more();
  }, [activeRow?.id, focusIndex, activeRow?.items.length, activeIndex, shown.length, rec.hasMore]);

  return (
    <div class="screen home">
      <div class="details-block">
        {focusedItem ? (
          <>
            <div class="eyebrow">{activeRow.title}</div>
            <h1 class="d-title">{focusedItem.title}</h1>
            <div class="d-meta">
              {videoMeta(focusedItem).map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>
          </>
        ) : loggedIn === false ? (
          <SignIn focused={f === 'signin'} />
        ) : null}
      </div>
      <div class="rows">
        {loggedIn === false && focusedItem && <SignIn focused={f === 'signin'} compact />}
        {shown.map((row, ri) => (
          <section key={row.id} class={cls('hrow', row !== activeRow && 'dim', row.headless && 'headless')}>
            {!row.headless && <h2>{row.title}</h2>}
            <div class="hrow-scroll">
              <div class="hrow-track">
                {row.items.map((item, i) => (
                  <Tile
                    key={item.kind + item.id}
                    item={item}
                    index={i}
                    fid={`${row.id}:${i}`}
                    zone={row.id}
                    focused={f === `${row.id}:${i}`}
                    isDefault={ri === 0 && i === 0}
                    row
                  />
                ))}
              </div>
            </div>
          </section>
        ))}
        {!shown.length && (
          <Status loading={loading} empty>
            {loggedIn === false ? '' : 'Nothing to show yet. Press S to search.'}
          </Status>
        )}
      </div>
    </div>
  );
}

const SIGN_IN_URL = 'https://accounts.google.com/ServiceLogin?service=youtube&continue=' + encodeURIComponent('https://www.youtube.com/');

function SignIn({ focused, compact }: { focused: boolean; compact?: boolean }) {
  return (
    <div class={cls('signin', compact && 'compact')}>
      <div>
        <div class="eyebrow">Not signed in</div>
        {!compact && <h1 class="d-title">Sign in to YouTube</h1>}
        <div class="d-meta">
          <span>Sign in to see Continue watching, History, Playlists and Subscriptions.</span>
        </div>
      </div>
      <button
        class={cls('btn', focused && 'focused')}
        data-fid="signin"
        data-default={compact ? undefined : ''}
        onClick={() => location.assign(SIGN_IN_URL)}
      >
        Sign in
      </button>
    </div>
  );
}

