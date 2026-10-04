// Messages between the content script (isolated world) and the page bridge (MAIN world).
// Both sides talk through window.postMessage, tagged with TAG so we ignore YouTube's own traffic.

export const TAG = '__yttv';

export interface PlayRequest {
  videoId: string;
  playlistId?: string;
  index?: number;
  startTimeSeconds?: number;
}

export interface PlayerStatus {
  videoId: string;
  title: string;
  author: string;
  time: number;
  duration: number;
  /** YouTube player state: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued */
  state: number;
  isLive: boolean;
  ad: boolean;
  playlistId: string;
  captions: boolean;
}

export interface BridgeMethods {
  /** POST /youtubei/v1/<endpoint>; resolves with the raw response text */
  api(endpoint: string, body: Record<string, unknown>): string;
  session(): { loggedIn: boolean; ready: boolean };
  play(req: PlayRequest): boolean;
  /** Activate or deactivate playback. Inactive = the bridge keeps the player paused. */
  setActive(active: boolean): void;
  toggle(): void;
  seekBy(seconds: number): void;
  /** toggles subtitles; resolves with the new state, or null when the video has none */
  captions(): boolean | null;
}

export type Method = keyof BridgeMethods;

export interface Request {
  [TAG]: 'req';
  id: number;
  method: Method;
  args: unknown[];
}

export interface Response {
  [TAG]: 'res';
  id: number;
  result?: unknown;
  error?: string;
}

export interface Event {
  [TAG]: 'evt';
  type: 'player';
  data: PlayerStatus;
}
