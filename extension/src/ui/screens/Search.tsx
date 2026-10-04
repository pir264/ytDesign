import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../../data/api';
import { cls, Icon, useFocused } from '../components';
import { focusedFid, setFocus } from '../focus';
import { setScreenHandler } from '../input';
import { back, recentSearches, showResults } from '../nav';
import type { Route } from '../store';

export function Search({ route }: { route: Route }) {
  const f = useFocused();
  const [q, setQ] = useState(route.q ?? '');
  const [sugg, setSugg] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const qRef = useRef(q);
  qRef.current = q;

  useEffect(() => {
    void recentSearches().then(setRecent);
    setFocus('input');
    return setScreenHandler((a) => {
      if (a === 'enter' && focusedFid() === 'input') {
        showResults(qRef.current);
        return true;
      }
      return false;
    });
  }, []);

  // Keep real DOM focus in sync with the virtual focus, so typing works only in the field.
  useEffect(() => {
    if (f === 'input') input.current?.focus();
    else input.current?.blur();
  }, [f]);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      api.suggestions(q).then((s) => alive && setSugg(s));
    }, 150);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const typed = q.trim().toLowerCase();
  const list = typed ? sugg.slice(0, 5) : [];

  return (
    <div class="screen search">
      <div class="search-wrap">
        <div class={cls('search-bar', f === 'input' && 'focused')}>
          {Icon.search(56)}
          <input
            ref={input}
            class="search-input"
            data-fid="input"
            data-zone="bar"
            data-default=""
            data-hover="off"
            value={q}
            spellcheck={false}
            autocomplete="off"
            placeholder="Search YouTube"
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
            onClick={() => setFocus('input')}
          />
          <button class={cls('bar-go', f === 'go' && 'focused')} data-fid="go" data-zone="bar" onClick={() => showResults(q)}>
            Search
          </button>
          <button class={cls('bar-close', f === 'close' && 'focused')} data-fid="close" data-zone="bar" aria-label="Close search" onClick={back}>
            {Icon.close()}
          </button>
        </div>

        <div class="sugg-list">
          {list.map((s, i) => {
            const fid = 'sugg:' + i;
            const head = s.toLowerCase().startsWith(typed) ? s.slice(0, typed.length) : '';
            return (
              <button key={s} class={cls('sugg', f === fid && 'focused')} data-fid={fid} data-zone="sugg" onClick={() => showResults(s)}>
                {Icon.search(36)}
                <span>
                  <b>{head}</b>
                  {s.slice(head.length)}
                </span>
              </button>
            );
          })}
        </div>

        {recent.length > 0 && (
          <div class="recent">
            <h2>Recent searches</h2>
            <div class="chips">
              {recent.map((r, i) => (
                <button key={r} class={cls('chip', f === 'chip:' + i && 'focused')} data-fid={'chip:' + i} data-zone="chips" onClick={() => showResults(r)}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
