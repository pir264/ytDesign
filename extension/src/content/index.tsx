// Content script entry: hides YouTube's own UI (see static/page.css) and mounts the TV UI
// in a shadow root on top of it.

import { render } from 'preact';
import uiCss from '../ui/ui.css';
import { App } from '../ui/App';
import { setFocusRoot } from '../ui/focus';
import { installInput } from '../ui/input';
import { setState } from '../ui/store';
import { bridge } from './bridge';

declare const browser: any;

const STAGE_W = 1920;
const STAGE_H = 1080;

function injectFonts() {
  const url = (w: number) => browser.runtime.getURL(`fonts/montserrat-latin-${w}-normal.woff2`);
  const style = document.createElement('style');
  style.textContent = [400, 500, 600, 700, 800, 900]
    .map((w) => `@font-face{font-family:'Montserrat';font-style:normal;font-weight:${w};font-display:block;src:url('${url(w)}') format('woff2');}`)
    .join('\n');
  (document.head ?? document.documentElement).appendChild(style);
}

function mount() {
  const host = document.createElement('div');
  host.id = 'yttv-host';
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = uiCss;
  const stage = document.createElement('div');
  stage.className = 'stage';
  shadow.append(style, stage);
  setFocusRoot(shadow);

  // Design canvas is 1920×1080; scale it to the screen, keeping 16:9.
  const fit = () => {
    const s = Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H);
    const x = (innerWidth - STAGE_W * s) / 2;
    const y = (innerHeight - STAGE_H * s) / 2;
    stage.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  };
  fit();
  window.addEventListener('resize', fit);

  render(<App stage={stage} />, stage);
}

function start() {
  injectFonts();
  mount();
  installInput();
  void bridge.session().then((s) => setState({ loggedIn: s.loggedIn }));
}

if (window.top === window) {
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
}
