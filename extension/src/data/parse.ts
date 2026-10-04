// Turns InnerTube JSON into small models for the UI.
// YouTube's response layout changes often, so instead of following fixed paths we walk the
// whole tree and pick up every renderer we know, wherever it sits.

export interface Video {
  kind: 'video';
  id: string;
  title: string;
  channel?: string;
  channelId?: string;
  duration?: string;
  /** percent watched, 0-100 */
  progress?: number;
  thumb: string;
  live?: boolean;
  meta?: string;
  /** date section in history ("Today", "Yesterday") */
  section?: string;
  startTime?: number;
}

export interface Playlist {
  kind: 'playlist';
  id: string;
  title: string;
  thumb: string;
  count?: string;
  meta?: string;
  firstVideoId?: string;
}

export type Item = Video | Playlist;

export interface Page {
  items: Item[];
  continuation?: string;
}

export interface Channel {
  id: string;
  name: string;
  avatar?: string;
  /** has new videos (guide shows a dot) */
  fresh?: boolean;
}

export interface Comment {
  id: string;
  author: string;
  avatar?: string;
  text: string;
  published?: string;
  likes?: string;
  replyCount?: number;
  /** continuation that loads this comment's replies */
  repliesToken?: string;
}

export interface Details {
  videoId: string;
  title: string;
  description: string;
  views?: string;
  date?: string;
  channel?: Channel & { subscribers?: string };
  commentsToken?: string;
}

export interface Comments {
  count?: string;
  comments: Comment[];
  /** continuation for the next page (more comments, or "Show more replies") */
  next?: string;
}

type J = any;

// ---------- helpers ----------

export function text(x: J): string {
  if (x == null) return '';
  if (typeof x === 'string') return x;
  if (typeof x.simpleText === 'string') return x.simpleText;
  if (Array.isArray(x.runs)) return x.runs.map((r: J) => r.text ?? '').join('');
  if (typeof x.content === 'string') return x.content;
  return '';
}

/** Depth-first search for the first value under `key`. */
export function dig(node: J, key: string): J {
  if (node == null || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const v of node) {
      const r = dig(v, key);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  if (key in node) return node[key];
  for (const k in node) {
    const r = dig(node[k], key);
    if (r !== undefined) return r;
  }
  return undefined;
}

export function digAll(node: J, key: string, out: J[] = []): J[] {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const v of node) digAll(v, key, out);
    return out;
  }
  for (const k in node) {
    if (k === key) out.push(node[k]);
    else digAll(node[k], key, out);
  }
  return out;
}

function best(thumbs: J): string {
  const list: J[] = Array.isArray(thumbs) ? thumbs : [];
  let pick: J;
  for (const t of list) if (!pick || (t.width ?? 0) > (pick.width ?? 0)) pick = t;
  let url: string = pick?.url ?? '';
  if (url.startsWith('//')) url = 'https:' + url;
  return url;
}

function videoThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function isShortsEndpoint(ep: J): boolean {
  if (!ep) return false;
  if (ep.reelWatchEndpoint) return true;
  const url: string = ep.commandMetadata?.webCommandMetadata?.url ?? '';
  return url.startsWith('/shorts/');
}

// ---------- renderers ----------

function fromVideoRenderer(r: J): Video | null {
  if (!r?.videoId || isShortsEndpoint(r.navigationEndpoint)) return null;
  const byline = r.ownerText ?? r.longBylineText ?? r.shortBylineText;
  const overlays: J[] = r.thumbnailOverlays ?? [];
  const timeStatus = overlays.find((o) => o.thumbnailOverlayTimeStatusRenderer)?.thumbnailOverlayTimeStatusRenderer;
  if (timeStatus?.style === 'SHORTS') return null;
  const resume = overlays.find((o) => o.thumbnailOverlayResumePlaybackRenderer)?.thumbnailOverlayResumePlaybackRenderer;
  const live =
    timeStatus?.style === 'LIVE' ||
    (r.badges ?? []).some((b: J) => b.metadataBadgeRenderer?.style === 'BADGE_STYLE_TYPE_LIVE_NOW');
  const meta = [text(r.publishedTimeText), text(r.videoInfo)].filter(Boolean)[0];
  return {
    kind: 'video',
    id: r.videoId,
    title: text(r.title),
    channel: text(byline) || undefined,
    channelId: byline?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId,
    duration: live ? 'LIVE' : text(r.lengthText) || text(timeStatus?.text) || undefined,
    progress: resume?.percentDurationWatched,
    thumb: best(r.thumbnail?.thumbnails) || videoThumb(r.videoId),
    live: live || undefined,
    meta: meta || undefined,
    startTime: r.navigationEndpoint?.watchEndpoint?.startTimeSeconds,
  };
}

function fromLockup(l: J): Item | null {
  const id: string = l?.contentId;
  if (!id) return null;
  const onTap = l.rendererContext?.commandContext?.onTap?.innertubeCommand;
  if (isShortsEndpoint(onTap)) return null;

  const md = l.metadata?.lockupMetadataViewModel;
  const title = text(md?.title);
  const rows: string[][] = (md?.metadata?.contentMetadataViewModel?.metadataRows ?? [])
    .filter((r: J) => !r.isSpacerRow && r.metadataParts)
    .map((r: J) => r.metadataParts.map((p: J) => text(p.text)).filter(Boolean));

  const image =
    l.contentImage?.thumbnailViewModel ?? l.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel;
  const thumb = best(image?.image?.sources);
  const badges: J[] = digAll(image?.overlays, 'thumbnailBadgeViewModel');
  const badge = badges.map((b) => b.text).find(Boolean) as string | undefined;
  const live = badges.some((b) => /LIVE/.test(b.badgeStyle ?? '') || b.text === 'LIVE');
  const progressBar = dig(image?.overlays, 'thumbnailOverlayProgressBarViewModel');

  if (l.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
    const channelId = digAll(md?.metadata, 'browseEndpoint')
      .map((b) => b.browseId)
      .find((b: string) => b?.startsWith('UC'));
    return {
      kind: 'video',
      id,
      title,
      channel: rows.length >= 2 ? rows[0][0] : undefined,
      channelId,
      duration: live ? 'LIVE' : badge,
      progress: progressBar?.startPercent,
      thumb: thumb || videoThumb(id),
      live: live || undefined,
      meta: rows.length ? rows[rows.length - 1].join(' · ') : undefined,
      startTime: onTap?.watchEndpoint?.startTimeSeconds,
    };
  }
  if (/PLAYLIST|PODCAST|ALBUM/.test(l.contentType ?? '')) {
    return {
      kind: 'playlist',
      id: onTap?.watchEndpoint?.playlistId ?? id,
      title,
      thumb,
      count: badge,
      meta: rows.map((r) => r.join(' · ')).join(' · ') || undefined,
      firstVideoId: onTap?.watchEndpoint?.videoId,
    };
  }
  return null;
}

function fromPlaylistRenderer(r: J): Playlist | null {
  if (!r?.playlistId) return null;
  return {
    kind: 'playlist',
    id: r.playlistId,
    title: text(r.title),
    thumb: best(r.thumbnail?.thumbnails ?? r.thumbnails?.[0]?.thumbnails ?? r.thumbnailRenderer?.playlistVideoThumbnailRenderer?.thumbnail?.thumbnails),
    count: text(r.videoCountShortText) || text(r.videoCountText) || r.videoCount || undefined,
    firstVideoId: r.navigationEndpoint?.watchEndpoint?.videoId,
  };
}

const VIDEO_RENDERERS = new Set([
  'videoRenderer',
  'gridVideoRenderer',
  'compactVideoRenderer',
  'playlistVideoRenderer',
  'playlistPanelVideoRenderer',
]);
const PLAYLIST_RENDERERS = new Set(['gridPlaylistRenderer', 'playlistRenderer', 'compactPlaylistRenderer']);
/** Subtrees we never want items from. */
const SKIP = new Set([
  'reelShelfRenderer',
  'reelItemRenderer',
  'shortsLockupViewModel',
  'responseContext',
  'frameworkUpdates',
  'topbar',
  'menu',
  'thumbnailOverlays',
  'header',
]);

/**
 * Collects every video/playlist in a browse/search response (including continuation responses),
 * in document order, without Shorts and without duplicates.
 */
export function parseItems(json: J): Page {
  const items: Item[] = [];
  const seen = new Set<string>();
  let continuation: string | undefined;

  const add = (item: Item | null, section?: string) => {
    if (!item || !item.title) return;
    const key = item.kind + ':' + item.id;
    if (seen.has(key)) return;
    seen.add(key);
    if (section && item.kind === 'video') item.section = section;
    items.push(item);
  };

  const walk = (node: J, section?: string) => {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const v of node) walk(v, section);
      return;
    }
    for (const k in node) {
      const v = node[k];
      if (SKIP.has(k)) continue;
      if (VIDEO_RENDERERS.has(k)) add(fromVideoRenderer(v), section);
      else if (k === 'lockupViewModel') add(fromLockup(v), section);
      else if (PLAYLIST_RENDERERS.has(k)) add(fromPlaylistRenderer(v), section);
      else if (k === 'richShelfRenderer' && v?.isShorts) continue;
      else if (k === 'continuationItemRenderer') {
        const token = v?.continuationEndpoint?.continuationCommand?.token ?? v?.button?.buttonRenderer?.command?.continuationCommand?.token;
        if (token) continuation = token;
      } else if (k === 'itemSectionRenderer' || k === 'shelfRenderer') {
        const title =
          text(v?.header?.itemSectionHeaderRenderer?.title) || text(v?.title) || dig(v?.header, 'title')?.content || '';
        walk(v, title || section);
      } else walk(v, section);
    }
  };
  walk(json);
  return { items, continuation };
}

/** Channels from the guide's Subscriptions section. */
export function parseGuideSubscriptions(json: J): Channel[] {
  const section = dig(json, 'guideSubscriptionsSectionRenderer');
  if (!section) return [];
  const out: Channel[] = [];
  for (const e of digAll(section, 'guideEntryRenderer')) {
    const id = e?.navigationEndpoint?.browseEndpoint?.browseId;
    if (!id || !id.startsWith('UC')) continue;
    out.push({
      id,
      name: text(e.formattedTitle) || e.accessibility?.accessibilityData?.label || '',
      avatar: best(e.thumbnail?.thumbnails),
      fresh: e.presentationStyle === 'GUIDE_ENTRY_PRESENTATION_STYLE_NEW_CONTENT' || undefined,
    });
  }
  return out;
}

/** Channel page header: name, avatar, subscriber line. */
export function parseChannelHeader(json: J): { name: string; avatar?: string; subscribers?: string } {
  const h = dig(json, 'pageHeaderViewModel');
  const name = text(h?.title?.dynamicTextViewModel?.text) || text(dig(json, 'channelMetadataRenderer')?.title) || '';
  const avatar = best(dig(h?.image, 'avatarViewModel')?.image?.sources);
  const parts = digAll(h?.metadata, 'metadataParts')
    .flat()
    .map((p: J) => text(p?.text));
  const subscribers = parts.find((p: string) => /subscriber|abonnee/i.test(p));
  return { name, avatar: avatar || undefined, subscribers };
}

/** /next response → details panel data. */
export function parseDetails(json: J, videoId: string): Details {
  const primary = dig(json, 'videoPrimaryInfoRenderer');
  const secondary = dig(json, 'videoSecondaryInfoRenderer');
  const owner = secondary?.owner?.videoOwnerRenderer;
  const description =
    text(secondary?.attributedDescription) ||
    text(secondary?.description) ||
    text(dig(json, 'expandableVideoDescriptionBodyRenderer')?.attributedDescriptionBodyText) ||
    '';
  const commentsSection = digAll(json, 'itemSectionRenderer').find(
    (s: J) => s?.sectionIdentifier === 'comment-item-section' && s?.targetId === 'comments-section',
  ) ?? digAll(json, 'itemSectionRenderer').find((s: J) => s?.sectionIdentifier === 'comment-item-section');
  return {
    videoId,
    title: text(primary?.title),
    description,
    views: text(primary?.viewCount?.videoViewCountRenderer?.viewCount) || undefined,
    date: text(primary?.dateText) || undefined,
    channel: owner
      ? {
          id: owner.navigationEndpoint?.browseEndpoint?.browseId ?? '',
          name: text(owner.title),
          avatar: best(owner.thumbnail?.thumbnails) || undefined,
          subscribers: text(owner.subscriberCountText) || undefined,
        }
      : undefined,
    commentsToken: dig(commentsSection, 'continuationCommand')?.token,
  };
}

/**
 * A comments page (or a page of replies) → comments in order, with tokens to load their replies
 * and the next page.
 */
export function parseComments(json: J): Comments {
  const header = dig(json, 'commentsHeaderRenderer');
  const count = header?.countText?.runs?.[0]?.text ?? (text(header?.commentsCount) || undefined);
  const comments: Comment[] = [];
  let next: string | undefined;

  // Current layout: threads and view models only hold keys; the content lives in entity payloads.
  const payloads = new Map<string, J>();
  for (const p of digAll(json?.frameworkUpdates, 'commentEntityPayload')) payloads.set(p?.key, p);

  const fromViewModel = (vm: J): Comment | null => {
    const p = payloads.get(vm?.commentKey);
    if (!p) return null;
    const replies = Number.parseInt(String(p.toolbar?.replyCount ?? '').replace(/\D/g, ''), 10);
    return {
      id: p.properties?.commentId ?? vm.commentId ?? vm.commentKey,
      author: p.author?.displayName ?? '',
      avatar: p.author?.avatarThumbnailUrl,
      text: p.properties?.content?.content ?? '',
      published: p.properties?.publishedTime,
      likes: p.toolbar?.likeCountNotliked?.trim() || undefined,
      replyCount: replies > 0 ? replies : undefined,
    };
  };
  const fromRenderer = (c: J): Comment => ({
    id: c.commentId,
    author: text(c.authorText),
    avatar: best(c.authorThumbnail?.thumbnails) || undefined,
    text: text(c.contentText),
    published: text(c.publishedTimeText) || undefined,
    likes: text(c.voteCount) || undefined,
    replyCount: c.replyCount || undefined,
  });

  const walk = (node: J) => {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const v of node) walk(v);
      return;
    }
    for (const k in node) {
      const v = node[k];
      if (k === 'frameworkUpdates' || k === 'header' || k === 'responseContext') continue;
      if (k === 'commentThreadRenderer') {
        const c = v.commentViewModel ? fromViewModel(v.commentViewModel.commentViewModel) : v.comment?.commentRenderer && fromRenderer(v.comment.commentRenderer);
        if (c) {
          c.repliesToken = dig(v.replies, 'continuationCommand')?.token;
          if (c.repliesToken && !c.replyCount) c.replyCount = 1;
          comments.push(c);
        }
      } else if (k === 'commentViewModel' && v?.commentKey) {
        const c = fromViewModel(v);
        if (c) comments.push(c);
      } else if (k === 'commentRenderer') {
        comments.push(fromRenderer(v));
      } else if (k === 'continuationItemRenderer') {
        next = v?.continuationEndpoint?.continuationCommand?.token ?? v?.button?.buttonRenderer?.command?.continuationCommand?.token ?? next;
      } else walk(v);
    }
  };
  walk(json);
  return { count, comments: comments.filter((c) => c.text), next };
}

/**
 * Whether the signed-in user is subscribed to a channel, from a channel page or /next response.
 * Undefined when the response doesn't say (e.g. signed out).
 */
export function parseSubscribed(json: J, channelId: string): boolean | undefined {
  // Entity store: the key is base64 protobuf that contains the channel id.
  for (const e of digAll(json, 'subscriptionStateEntity')) {
    try {
      const key = atob(decodeURIComponent(e.key).replace(/-/g, '+').replace(/_/g, '/'));
      if (key.includes(channelId) && typeof e.subscribed === 'boolean') return e.subscribed;
    } catch {
      /* not base64 */
    }
  }
  for (const b of digAll(json, 'subscribeButtonRenderer')) {
    if (b?.channelId === channelId && typeof b.subscribed === 'boolean') return b.subscribed;
  }
  const vm = dig(json, 'subscribeButtonViewModel');
  const flag = vm && digAll(vm, 'subscribed').find((x: J) => typeof x === 'boolean');
  return typeof flag === 'boolean' ? flag : undefined;
}

/** First video of a playlist page (browse VL<id>). */
export function parseFirstVideo(json: J): string | undefined {
  const first = parseItems(json).items.find((i) => i.kind === 'video');
  return first?.id;
}
