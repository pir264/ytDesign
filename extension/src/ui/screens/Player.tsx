import { useEffect, useRef, useState } from 'preact/hooks';
import { bridge } from '../../content/bridge';
import { cls, Icon, useFocused } from '../components';
import { focusedFid, setFocus } from '../focus';
import { IDLE_MS, setScreenHandler } from '../input';
import { back } from '../nav';
import { DetailsPanel, panelKey, setDetails } from './Details';
import { getState, setState, toast, useStore, type Route } from '../store';

const BOTTOM = new Set(['play', 'rew', 'fwd']);

function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  t = Math.floor(t);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function Player({ route }: { route: Route }) {
  const f = useFocused();
  const status = useStore((s) => s.player);
  const detailsOpen = useStore((s) => s.detailsOpen);
  const activity = useStore((s) => s.activity);
  const [now, setNow] = useState(Date.now());
  // Ignore player reports until YouTube actually switched to our video.
  const synced = useRef(false);
  const lastVideo = useRef<string | undefined>(undefined);

  useEffect(() => {
    document.documentElement.classList.add('yttv-play');
    setState({ player: null });
    const off = bridge.onPlayer((s) => {
      if (!synced.current && s.videoId !== route.play?.videoId) return;
      synced.current = true;
      setState({ player: s });
    });
    void bridge.setActive(true).then(() => route.play && bridge.play(route.play));
    const tick = setInterval(() => setNow(Date.now()), 500);
    setFocus('play');

    const unhandle = setScreenHandler((a, { wasIdle, wheel }) => {
      const s = getState();
      const playing = s.player?.state === 1;
      const shown = !wasIdle || !playing || s.detailsOpen;
      const fid = focusedFid() ?? 'play';
      switch (a) {
        case 'back':
          back();
          return true;
        case 'playpause':
          void bridge.toggle();
          return true;
        case 'seekback':
        case 'seekfwd':
          void bridge.seekBy(a === 'seekback' ? -10 : 10);
          return true;
        case 'captions':
          void bridge.captions().then((on) => toast(on === null ? 'No subtitles for this video' : on ? 'Subtitles on' : 'Subtitles off'));
          return true;
        case 'search':
        case 'home':
          return true;
      }
      if (s.detailsOpen && panelKey(a, !!wheel)) return true;
      // The first key after the overlay hid only brings it back (arrows still seek, as on a TV).
      if (!shown && (a === 'up' || a === 'down' || a === 'enter')) return true;
      if ((a === 'left' || a === 'right') && (BOTTOM.has(fid) || !shown)) {
        void bridge.seekBy(a === 'left' ? -10 : 10);
        return true;
      }
      if (a === 'up' && BOTTOM.has(fid)) {
        setFocus('back');
        return true;
      }
      if (a === 'down' && (fid === 'back' || fid === 'details')) {
        setFocus('play');
        return true;
      }
      return false;
    });

    return () => {
      off();
      unhandle();
      clearInterval(tick);
      document.documentElement.classList.remove('yttv-play');
      void bridge.setActive(false);
      setState({ player: null, detailsOpen: false });
    };
  }, []);

  // New video (playlist moved on): close the details panel, as the design asks.
  useEffect(() => {
    if (!status?.videoId) return;
    if (lastVideo.current && lastVideo.current !== status.videoId) setState({ detailsOpen: false });
    lastVideo.current = status.videoId;
  }, [status?.videoId]);

  // A single video ended: go back to where it was started from.
  useEffect(() => {
    if (status?.state === 0 && !status.playlistId) back();
  }, [status?.state]);

  const video = route.video;
  const title = status?.title || video?.title || '';
  const channel = status?.author || (video?.kind === 'video' ? video.channel : '') || '';
  const videoId = status?.videoId || route.play?.videoId || '';
  const playing = status?.state === 1;
  const visible = !playing || detailsOpen || now - activity < IDLE_MS;
  const live = status?.isLive || (video?.kind === 'video' && video.live);
  const pct = status && status.duration > 0 ? Math.min(100, (status.time / status.duration) * 100) : 0;

  return (
    <div class={cls('screen player', !visible && 'idle')}>
      <div class="p-click" onClick={() => void bridge.toggle()} />
      <div class="p-top-shade" />
      <button class={cls('p-pill p-back', f === 'back' && 'focused')} data-fid="back" onClick={back}>
        {Icon.back()}
        <span>Back</span>
        <span class="key">Esc</span>
      </button>
      <button class={cls('p-pill p-details', f === 'details' && 'focused')} data-fid="details" onClick={() => setDetails(!detailsOpen)}>
        {Icon.info()}
        <span>Details</span>
      </button>
      {status?.ad && <div class="p-ad">Skipping ad…</div>}

      <div class="p-bottom-shade" />
      <div class="p-controls" style={{ right: detailsOpen ? 736 : 96 }}>
        <div class="p-info">
          <h1>{title}</h1>
          <div class="p-channel">{channel}</div>
        </div>
        <div class="p-progress">
          <span>{live ? 'LIVE' : fmt(status?.time ?? 0)}</span>
          <div class="p-bar">
            <div class="p-played" style={{ width: (live ? 100 : pct) + '%' }} />
            {!live && <div class="p-knob" style={{ left: pct + '%' }} />}
          </div>
          <span class="p-dur">{live ? '' : fmt(status?.duration ?? 0)}</span>
        </div>
        <div class="p-buttons">
          <button class={cls('p-round', f === 'rew' && 'focused')} data-fid="rew" aria-label="Back 10 seconds" onClick={() => void bridge.seekBy(-10)}>
            {Icon.rewind()}
          </button>
          <button
            class={cls('p-round p-main', f === 'play' && 'focused')}
            data-fid="play"
            data-default=""
            aria-label="Play or pause"
            onClick={() => void bridge.toggle()}
          >
            {playing ? Icon.pause() : Icon.play()}
          </button>
          <button class={cls('p-round', f === 'fwd' && 'focused')} data-fid="fwd" aria-label="Forward 10 seconds" onClick={() => void bridge.seekBy(10)}>
            {Icon.forward()}
          </button>
        </div>
      </div>

      {detailsOpen && <DetailsPanel key={videoId} videoId={videoId} />}
    </div>
  );
}
