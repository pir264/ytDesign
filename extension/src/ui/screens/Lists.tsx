// Grid screens: search results, History, Playlists, Subscriptions and a channel's videos.

import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { api, type ChannelHeader } from '../../data/api';
import type { Channel, Item } from '../../data/parse';
import { cls, Grid, itemFid, Status, SURFACES, useFocused, useVideoMeta } from '../components';
import { invalidate, useAsync, useFeed } from '../data';
import { setFocus } from '../focus';
import { openChannel } from '../nav';
import { toast, useStore, type Route } from '../store';

export function Results({ route }: { route: Route }) {
  const q = route.q ?? '';
  const f = useFocused();
  const feed = useFeed('results:' + q, (cont) => api.search(q, cont));
  const item = feed.items.find((i) => itemFid('grid', i) === f) ?? feed.items[0];
  const meta = useVideoMeta(item);
  return (
    <div class="screen results">
      <div class="results-head">
        <div class="eyebrow">
          Results for “{q}”{feed.items.length ? ` · ${feed.items.length}${feed.hasMore ? '+' : ''}` : ''}
        </div>
        <h1 class="d-title small">{item?.title ?? ' '}</h1>
        <div class="d-meta">
          {meta
            .filter((m) => !m.endsWith('watched'))
            .map((m) => (
              <span key={m}>{m}</span>
            ))}
        </div>
      </div>
      <div class="scroller" style={{ top: 365 }}>
        <Grid items={feed.items} focused={f} hasMore={feed.hasMore} more={feed.more} />
        <Status loading={feed.loading} error={feed.error} empty={!feed.items.length} retry={feed.reload}>
          No results.
        </Status>
      </div>
    </div>
  );
}

function PageHead({ title, sub, action }: { title: string; sub?: string; action?: ComponentChildren }) {
  return (
    <div class="page-head">
      <div class="page-title">
        <h1>{title}</h1>
        {action}
      </div>
      {sub && <div class="sub">{sub}</div>}
    </div>
  );
}

function NeedsLogin() {
  return <div class="status quiet">Sign in to YouTube to see this page.</div>;
}

export function History() {
  const f = useFocused();
  const loggedIn = useStore((s) => s.loggedIn);
  const feed = useFeed('history', api.history, loggedIn === true);
  return (
    <div class="screen library">
      <PageHead title="History" sub="Recently watched" />
      <div class="scroller" style={{ top: 268 }}>
        {loggedIn === false ? (
          <NeedsLogin />
        ) : (
          <>
            <Grid
              items={feed.items}
              focused={f}
              hasMore={feed.hasMore}
              more={feed.more}
              metaFor={(i) => [i.kind === 'video' && i.section, i.kind === 'video' && i.channel].filter(Boolean).join(' · ')}
            />
            <Status loading={feed.loading} error={feed.error} empty={!feed.items.length} retry={feed.reload}>
              Nothing watched yet.
            </Status>
          </>
        )}
      </div>
    </div>
  );
}

export function Playlists() {
  const f = useFocused();
  const loggedIn = useStore((s) => s.loggedIn);
  const feed = useFeed('playlists', api.playlists, loggedIn === true);
  return (
    <div class="screen library">
      <PageHead title="Playlists" sub="Plays from the first video" />
      <div class="scroller" style={{ top: 268 }}>
        {loggedIn === false ? (
          <NeedsLogin />
        ) : (
          <>
            <Grid
              items={feed.items}
              focused={f}
              hasMore={feed.hasMore}
              more={feed.more}
              metaFor={(i: Item) => (i.kind === 'playlist' ? i.meta : i.channel)}
            />
            <Status loading={feed.loading} error={feed.error} empty={!feed.items.length} retry={feed.reload} />
          </>
        )}
      </div>
    </div>
  );
}

function ChannelStrip({ channels, focused }: { channels: Channel[]; focused?: string }) {
  return (
    <div class="channel-strip">
      {channels.map((ch, i) => {
        const fid = 'ch:' + i;
        return (
          <button
            key={ch.id}
            class={cls('channel', focused === fid && 'focused', ch.fresh && 'fresh')}
            data-fid={fid}
            data-zone="channels"
            onClick={() => {
              setFocus(fid);
              openChannel(ch.id, ch.name);
            }}
          >
            <div class="avatar" style={{ background: SURFACES[i % SURFACES.length] }}>
              {ch.avatar ? <img src={ch.avatar} alt="" /> : ch.name.charAt(0)}
            </div>
            <div class="name">{ch.name}</div>
          </button>
        );
      })}
    </div>
  );
}

export function Subscriptions() {
  const f = useFocused();
  const loggedIn = useStore((s) => s.loggedIn);
  const feed = useFeed('subs', api.subscriptionFeed, loggedIn === true);
  const channels = useAsync(loggedIn ? 'channels' : null, api.subscribedChannels);
  return (
    <div class="screen library">
      <PageHead title="Subscriptions" sub="Latest from your channels" />
      {loggedIn === false ? (
        <div class="scroller" style={{ top: 268 }}>
          <NeedsLogin />
        </div>
      ) : (
        <div class="scroller" style={{ top: 268 }}>
          {channels.data && channels.data.length > 0 && <ChannelStrip channels={channels.data} focused={f} />}
          <Grid
            items={feed.items}
            focused={f}
            hasMore={feed.hasMore}
            more={feed.more}
            metaFor={(i) => (i.kind === 'video' ? [i.channel, i.meta].filter(Boolean).join(' · ') : i.meta)}
          />
          <Status loading={feed.loading} error={feed.error} empty={!feed.items.length} retry={feed.reload} />
        </div>
      )}
    </div>
  );
}

export function ChannelPage({ route }: { route: Route }) {
  const f = useFocused();
  const id = route.channelId!;
  const loggedIn = useStore((s) => s.loggedIn);
  const feed = useFeed('channel:' + id, async (cont) => {
    const page = await api.channel(id, cont);
    return { ...page, extra: 'header' in page ? page.header : undefined };
  });
  const header = feed.extra as ChannelHeader | undefined;
  const name = header?.name || route.channelName || 'Channel';
  return (
    <div class="screen library">
      <PageHead
        title={name}
        sub={header?.subscribers ?? 'Latest videos'}
        action={loggedIn && header && <SubscribeButton channelId={id} name={name} initial={!!header.subscribed} focused={f === 'subscribe'} />}
      />
      <div class="scroller" style={{ top: 268 }}>
        <Grid items={feed.items} focused={f} hasMore={feed.hasMore} more={feed.more} metaFor={(i) => (i.kind === 'video' ? i.meta : undefined)} />
        <Status loading={feed.loading} error={feed.error} empty={!feed.items.length} retry={feed.reload} />
      </div>
    </div>
  );
}

/** Subscribe / unsubscribe. Unsubscribing asks for a second press, so it can't happen by accident. */
function SubscribeButton({ channelId, name, initial, focused }: { channelId: string; name: string; initial: boolean; focused: boolean }) {
  const [subscribed, setSubscribed] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 4000);
    return () => clearTimeout(t);
  }, [confirm]);
  useEffect(() => {
    if (!focused) setConfirm(false);
  }, [focused]);

  const press = async () => {
    if (busy) return;
    if (subscribed && !confirm) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    try {
      await api.setSubscribed(channelId, !subscribed);
      setSubscribed(!subscribed);
      toast(subscribed ? `Unsubscribed from ${name}` : `Subscribed to ${name}`);
      // Feeds and the channel strip change with this.
      invalidate('subs');
      invalidate('home:subs');
      invalidate('channel:' + channelId);
    } catch {
      toast("Couldn't change the subscription");
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <button
      class={cls('subscribe', subscribed && !confirm && 'on', confirm && 'confirm', focused && 'focused')}
      data-fid="subscribe"
      data-zone="head"
      onClick={press}
    >
      {busy ? '…' : confirm ? 'Press again to unsubscribe' : subscribed ? '✓ Subscribed' : 'Subscribe'}
    </button>
  );
}
