import { useEffect } from 'preact/hooks';
import { TopBar, cls } from './components';
import { elementFor, ensureFocus } from './focus';
import { Home } from './screens/Home';
import { ChannelPage, History, Playlists, Results, Subscriptions } from './screens/Lists';
import { Player } from './screens/Player';
import { Search } from './screens/Search';
import { routeKey, subscribe, getState, useStore, currentKey, type Route } from './store';

function Screen({ route }: { route: Route }) {
  switch (route.screen) {
    case 'home':
      return <Home />;
    case 'search':
      return <Search route={route} />;
    case 'results':
      return <Results route={route} />;
    case 'history':
      return <History />;
    case 'playlists':
      return <Playlists />;
    case 'subs':
      return <Subscriptions />;
    case 'channel':
      return <ChannelPage route={route} />;
    case 'player':
      return <Player route={route} />;
  }
}

/** Keeps a focused element on screen and in view, whatever renders. */
function useFocusKeeper(stage: HTMLElement) {
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      clearTimeout(timer);
      timer = window.setTimeout(ensureFocus, 0);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(stage, { childList: true, subtree: true });
    schedule();

    let lastFid: string | undefined;
    let lastKey = '';
    const unsubscribe = subscribe(() => {
      const key = currentKey();
      const fid = getState().focus[key];
      if (fid === lastFid && key === lastKey) return;
      const screenChanged = key !== lastKey;
      lastFid = fid;
      lastKey = key;
      setTimeout(() => {
        const el = elementFor(fid);
        if (!el || el.closest('[data-manual-scroll]')) return;
        el.scrollIntoView({
          block: (el.dataset.block as ScrollLogicalPosition) ?? 'nearest',
          inline: 'nearest',
          behavior: screenChanged ? 'instant' : 'smooth',
        });
      }, 0);
    });
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, []);
}

const WITH_TOPBAR = new Set(['home', 'results', 'history', 'playlists', 'subs', 'channel']);

export function App({ stage }: { stage: HTMLElement }) {
  const route = useStore((s) => s.stack[s.stack.length - 1]);
  const cursorHidden = useStore((s) => s.cursorHidden);
  const refresh = useStore((s) => s.refresh);
  const toast = useStore((s) => s.toast);
  useFocusKeeper(stage);

  useEffect(() => {
    stage.classList.toggle('nocursor', cursorHidden);
  }, [cursorHidden]);
  useEffect(() => {
    stage.classList.toggle('playing', route.screen === 'player');
  }, [route.screen]);

  const active = route.screen === 'channel' ? 'subs' : route.screen;
  return (
    <>
      <Screen key={routeKey(route) + '#' + refresh} route={route} />
      {WITH_TOPBAR.has(route.screen) && <TopBar active={active} />}
      <div class={cls('toast', toast && 'show')}>{toast}</div>
    </>
  );
}
