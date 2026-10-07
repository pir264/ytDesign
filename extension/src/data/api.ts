import { bridge } from '../content/bridge';
import {
  parseChannelHeader,
  parseComments,
  parseDetails,
  parseFirstVideo,
  parseGuideSubscriptions,
  parseItems,
  parseSubscribed,
  type Channel,
  type Comments,
  type Details,
  type Page,
  type Playlist,
} from './parse';

declare const browser: any;

async function call(endpoint: string, body: Record<string, unknown>): Promise<any> {
  return JSON.parse(await bridge.api(endpoint, body));
}

const browse = (browseId: string, continuation?: string, params?: string): Promise<Page> =>
  call('browse', continuation ? { continuation } : { browseId, ...(params ? { params } : {}) }).then(parseItems);

/** Channel page "Videos" tab. */
const VIDEOS_TAB = 'EgZ2aWRlb3PyBgQKAjoA';

export type ChannelHeader = ReturnType<typeof parseChannelHeader> & { subscribed?: boolean };

const detailsCache = new Map<string, Promise<Details>>();

const LIBRARY_PLAYLISTS: Playlist[] = [
  { kind: 'playlist', id: 'WL', title: 'Watch later', thumb: '', meta: 'Private' },
  { kind: 'playlist', id: 'LL', title: 'Liked videos', thumb: '', meta: 'Private' },
];

export const api = {
  session: () => bridge.session(),

  home: (cont?: string) => browse('FEwhat_to_watch', cont),
  history: (cont?: string) => browse('FEhistory', cont),
  subscriptionFeed: (cont?: string) => browse('FEsubscriptions', cont),

  async playlists(cont?: string): Promise<Page> {
    if (cont) return browse('FEplaylist_aggregation', cont);
    let page = await browse('FEplaylist_aggregation');
    if (!page.items.length) page = await browse('FElibrary');
    const items = page.items.filter((i) => i.kind === 'playlist');
    const missing = LIBRARY_PLAYLISTS.filter((p) => !items.some((i) => i.id === p.id));
    return { items: [...missing, ...items], continuation: page.continuation };
  },

  async playlistFirstVideo(playlistId: string): Promise<string | undefined> {
    return parseFirstVideo(await call('browse', { browseId: 'VL' + playlistId }));
  },

  search: (query: string, cont?: string): Promise<Page> =>
    call('search', cont ? { continuation: cont } : { query }).then(parseItems),

  async channel(channelId: string, cont?: string): Promise<Page & { header?: ChannelHeader }> {
    if (cont) return browse(channelId, cont);
    const json = await call('browse', { browseId: channelId, params: VIDEOS_TAB });
    return { ...parseItems(json), header: { ...parseChannelHeader(json), subscribed: parseSubscribed(json, channelId) } };
  },

  async setSubscribed(channelId: string, subscribe: boolean): Promise<void> {
    await call(subscribe ? 'subscription/subscribe' : 'subscription/unsubscribe', { channelIds: [channelId] });
  },

  async subscribedChannels(): Promise<Channel[]> {
    return parseGuideSubscriptions(await call('guide', {}));
  },

  /** Cached per video: the details block on Home asks for it too, and so does the details panel. */
  details(videoId: string): Promise<Details> {
    let p = detailsCache.get(videoId);
    if (!p) {
      p = call('next', { videoId }).then((json) => parseDetails(json, videoId));
      p.catch(() => detailsCache.delete(videoId));
      detailsCache.set(videoId, p);
      if (detailsCache.size > 200) detailsCache.delete(detailsCache.keys().next().value!);
    }
    return p;
  },

  /** A page of comments, or of replies to one comment. */
  async comments(token: string): Promise<Comments> {
    return parseComments(await call('next', { continuation: token }));
  },

  /** Search suggestions come from Google's suggest service, fetched by the background script (CORS). */
  async suggestions(query: string): Promise<string[]> {
    if (!query.trim()) return [];
    try {
      return (await browser.runtime.sendMessage({ type: 'suggest', query })) ?? [];
    } catch {
      return [];
    }
  },
};
