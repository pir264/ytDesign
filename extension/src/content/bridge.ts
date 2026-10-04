// Content-script side of the page bridge. Messages travel as tagged JSON strings, which avoids
// Firefox Xray wrapper issues when objects cross between the isolated and MAIN worlds.

import { TAG, type BridgeMethods, type Method, type PlayerStatus } from '../shared/protocol';

const PREFIX = TAG + ':';
let seq = 0;
const pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();
const playerListeners = new Set<(s: PlayerStatus) => void>();

window.addEventListener('message', (e) => {
  if (e.source !== window || typeof e.data !== 'string' || !e.data.startsWith(PREFIX)) return;
  const msg = JSON.parse(e.data.slice(PREFIX.length));
  if (msg[TAG] === 'res') {
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error));
    else p.resolve(msg.result);
  } else if (msg[TAG] === 'evt' && msg.type === 'player') {
    for (const l of playerListeners) l(msg.data);
  }
});

function call<M extends Method>(method: M, ...args: Parameters<BridgeMethods[M]>): Promise<ReturnType<BridgeMethods[M]>> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    window.postMessage(PREFIX + JSON.stringify({ [TAG]: 'req', id, method, args }), location.origin);
  });
}

export const bridge = {
  api: (endpoint: string, body: Record<string, unknown>) => call('api', endpoint, body),
  session: () => call('session'),
  play: (...a: Parameters<BridgeMethods['play']>) => call('play', ...a),
  setActive: (active: boolean) => call('setActive', active),
  toggle: () => call('toggle'),
  seekBy: (s: number) => call('seekBy', s),
  captions: () => call('captions'),
  onPlayer(fn: (s: PlayerStatus) => void) {
    playerListeners.add(fn);
    return () => playerListeners.delete(fn);
  },
};
