// Stand-in for src/content/bridge.ts in the dev harness (npm run dev): answers InnerTube calls
// from the recorded fixtures and simulates a player, so the UI can be worked on in any browser
// without YouTube or a signed-in account.

import type { BridgeMethods, PlayerStatus, PlayRequest } from '../src/shared/protocol';

const fixtures: Record<string, Promise<any>> = {};
const fixture = (name: string) =>
  (fixtures[name] ??= fetch(`fixtures/${name}.json`).then((r) => r.json()));

/** The video played last; history lists it first, as YouTube does. */
let lastPlayed = '';

/**
 * Channel fixture with watch progress and history date sections, as FEhistory looks.
 * The video played last comes first.
 */
async function history() {
  const ch = structuredClone(await fixture('channel'));
  const lockups: any[] = [];
  (function walk(n: any) {
    if (!n || typeof n !== 'object') return;
    if (n.lockupViewModel) lockups.push(n.lockupViewModel);
    for (const k in n) walk(n[k]);
  })(ch);
  const at = lockups.findIndex((l) => l.contentId === lastPlayed);
  if (at > 0) lockups.unshift(...lockups.splice(at, 1));
  lockups.forEach((l, i) => {
    if (i >= 8) return;
    l.contentImage.thumbnailViewModel.overlays.push({
      thumbnailBottomOverlayViewModel: {
        progressBar: { thumbnailOverlayProgressBarViewModel: { startPercent: [35, 70, 15, 50, 20, 100, 60, 40][i] } },
      },
    });
  });
  const sections = ['Today', 'Yesterday', 'Last week'].map((title, s) => ({
    itemSectionRenderer: {
      header: { itemSectionHeaderRenderer: { title: { simpleText: title } } },
      contents: lockups.slice(s * 10, s * 10 + 10).map((l) => ({ lockupViewModel: l })),
    },
  }));
  return { contents: { sectionListRenderer: { contents: sections } } };
}

async function guide() {
  const names = ['Homelab Diaries', 'Fireship', 'Core Dumped', 'Kitchen Basics', 'Paradiso Live', 'Neon Nights', 'Ambient Lab', 'Lofi Girl'];
  return {
    items: [
      {
        guideSubscriptionsSectionRenderer: {
          items: names.map((name, i) => ({
            guideEntryRenderer: {
              formattedTitle: { simpleText: name },
              navigationEndpoint: { browseEndpoint: { browseId: 'UCsBjURrPoezykLs9EqgamOA' } },
              thumbnail: { thumbnails: [] },
              presentationStyle: i < 2 ? 'GUIDE_ENTRY_PRESENTATION_STYLE_NEW_CONTENT' : undefined,
            },
          })),
        },
      },
    ],
  };
}

/** Which fixture answers a comments continuation token. */
async function commentsFor(token: string) {
  const [first, page2, replies] = await Promise.all([fixture('comments'), fixture('comments-page2'), fixture('replies')]);
  const tokens = (json: any) => JSON.stringify(json).match(/"token":"[^"]+"/g) ?? [];
  if (tokens(await fixture('next')).includes(`"token":"${token}"`)) return first;
  if (tokens(first).includes(`"token":"${token}"`)) {
    // a reply token from a thread, or the next page token (the last one outside the threads)
    const next = JSON.stringify(first.onResponseReceivedEndpoints.at(-1)).match(/"continuationItemRenderer".*"token":"([^"]+)"/)?.[1];
    return token === next ? page2 : replies;
  }
  if (tokens(page2).includes(`"token":"${token}"`) || tokens(replies).includes(`"token":"${token}"`)) return replies;
  return first;
}

async function api(endpoint: string, body: any): Promise<string> {
  await new Promise((r) => setTimeout(r, 250));
  let json: any;
  if (endpoint === 'guide') json = await guide();
  else if (endpoint === 'search') json = await fixture('search');
  else if (endpoint === 'next') json = body.continuation ? await commentsFor(body.continuation) : await fixture('next');
  else if (endpoint.startsWith('subscription/')) json = {};
  else if (body.continuation) json = {};
  else if (body.browseId === 'FEhistory') json = await history();
  else if (body.browseId === 'FEplaylist_aggregation') {
    const s = await fixture('search');
    json = { items: [s, s] }; // playlists (Mixes) from the search fixture
  } else if (body.browseId === 'FEwhat_to_watch') json = { a: await fixture('search'), b: await fixture('channel') }; // ~50 videos
  else json = await fixture('channel');
  return JSON.stringify(json);
}

// ---- simulated player ----

let status: PlayerStatus | null = null;
let timer = 0;
const listeners = new Set<(s: PlayerStatus) => void>();
const emit = () => status && listeners.forEach((l) => l({ ...status! }));

function play(req: PlayRequest) {
  lastPlayed = req.videoId;
  status = {
    videoId: req.videoId,
    title: '',
    author: '',
    time: req.startTimeSeconds ?? 0,
    duration: 212,
    state: 1,
    isLive: false,
    ad: false,
    playlistId: req.playlistId ?? '',
    captions: false,
  };
  clearInterval(timer);
  timer = window.setInterval(() => {
    if (status?.state === 1) status.time = Math.min(status.duration, status.time + 0.4);
    emit();
  }, 400);
  return true;
}

type Async<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<R> : never };

export const bridge: Async<BridgeMethods> & { onPlayer(fn: (s: PlayerStatus) => void): () => void } = {
  api: (endpoint, body) => api(endpoint, body),
  session: async () => ({ loggedIn: !location.hash.includes('loggedout'), ready: true }),
  play: async (req) => play(req),
  setActive: async (active) => {
    if (!active && status) status.state = 2;
  },
  toggle: async () => {
    if (status) status.state = status.state === 1 ? 2 : 1;
    emit();
  },
  seekBy: async (s) => {
    if (status) status.time = Math.max(0, Math.min(status.duration, status.time + s));
    emit();
  },
  captions: async () => {
    if (status) status.captions = !status.captions;
    return status ? status.captions : null;
  },
  onPlayer(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
