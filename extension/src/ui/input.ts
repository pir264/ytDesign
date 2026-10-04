// Keyboard, air-mouse and wheel input → UI actions.

import { elementFor, focusedFid, move, setFocus } from './focus';
import { back, go, openSearch } from './nav';
import { current, getState, setState } from './store';
import { bridge } from '../content/bridge';

export type Action =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'enter'
  | 'back'
  | 'home'
  | 'search'
  | 'playpause'
  | 'seekback'
  | 'seekfwd'
  | 'captions';

export interface InputContext {
  /** no input for 4 s before this key: the player overlay was hidden */
  wasIdle: boolean;
  /** came from the mouse wheel rather than a key */
  wheel?: boolean;
}

type Handler = (a: Action, ctx: InputContext) => boolean;
let screenHandler: Handler | null = null;

/** The active screen may take actions first; return true when handled. */
export function setScreenHandler(h: Handler | null) {
  screenHandler = h;
  return () => {
    if (screenHandler === h) screenHandler = null;
  };
}

export const IDLE_MS = 4000;
let lastActivityWrite = 0;

function markActivity() {
  const now = Date.now();
  if (now - lastActivityWrite < 200 && !getState().cursorHidden) return;
  lastActivityWrite = now;
  setState({ activity: now });
}

function isTextInput(node: EventTarget | undefined): node is HTMLInputElement {
  return node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement;
}

function actionFor(e: KeyboardEvent, inInput: boolean): Action | null {
  switch (e.key) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    case 'Enter':
    case 'Select':
      return 'enter';
    case 'Escape':
    case 'BrowserBack':
    case 'GoBack':
      return 'back';
    case 'Backspace':
      return inInput ? null : 'back';
    case 'BrowserHome':
    case 'GoHome':
      return 'home';
    case 'MediaPlayPause':
    case 'MediaPlay':
    case 'MediaPause':
      return 'playpause';
    case 'MediaFastForward':
    case 'MediaTrackNext':
      return 'seekfwd';
    case 'MediaRewind':
    case 'MediaTrackPrevious':
      return 'seekback';
  }
  if (inInput) return null;
  switch (e.key.toLowerCase()) {
    case ' ':
    case 'k':
      return 'playpause';
    case 'j':
      return 'seekback';
    case 'l':
      return 'seekfwd';
    case 'c':
      return 'captions';
    case 's':
      return 'search';
  }
  return null;
}

let overlayOff = false;

/** Ctrl+Shift+Y: hide the TV UI and use YouTube as normal (escape hatch). */
function toggleOverlay() {
  overlayOff = !overlayOff;
  document.documentElement.classList.toggle('yttv-off', overlayOff);
  void bridge.setActive(overlayOff || current().screen === 'player');
}

function onKeyDown(e: KeyboardEvent) {
  if (e.ctrlKey && e.shiftKey && e.code === 'KeyY') {
    e.preventDefault();
    e.stopImmediatePropagation();
    toggleOverlay();
    return;
  }
  if (overlayOff || e.ctrlKey || e.altKey || e.metaKey) return;

  const wasIdle = Date.now() - getState().activity > IDLE_MS;
  markActivity();
  // YouTube's own shortcuts must never see our keys.
  e.stopImmediatePropagation();

  const target = e.composedPath()[0];
  const inInput = isTextInput(target);
  if (inInput && (e.key.length === 1 || ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Backspace', 'Delete'].includes(e.key))) {
    return; // normal text editing
  }

  // On the search screen, typing anywhere goes into the search field.
  if (!inInput && current().screen === 'search' && (e.key.length === 1 || e.key === 'Backspace') && e.key !== ' ') {
    const input = elementFor('input');
    if (input) {
      setFocus('input');
      input.focus();
      return;
    }
  }

  const action = actionFor(e, inInput);
  if (!action) return;
  e.preventDefault();
  if (screenHandler?.(action, { wasIdle })) return;

  switch (action) {
    case 'up':
    case 'down':
    case 'left':
    case 'right':
      move(action);
      break;
    case 'enter':
      elementFor(focusedFid())?.click();
      break;
    case 'back':
      back();
      break;
    case 'home':
      go('home');
      break;
    case 'search':
      openSearch();
      break;
  }
}

// ---- air mouse ----

let lastX = -1;
let lastY = -1;
let lastRealMove = 0;
let lastWheel = 0;

function onMouseMove(e: MouseEvent) {
  // Firefox also fires mousemove when content scrolls under a resting cursor; ignore those,
  // or tiles sliding under the pointer would steal the focus while using the D-pad.
  if (e.screenX === lastX && e.screenY === lastY) return;
  lastX = e.screenX;
  lastY = e.screenY;
  if (getState().cursorHidden) setState({ cursorHidden: false });
  lastRealMove = Date.now();
  markActivity();
  if (overlayOff) return;
  for (const node of e.composedPath()) {
    if (node instanceof HTMLElement && node.dataset.fid) {
      if (node.dataset.fid !== focusedFid() && node.dataset.hover !== 'off') setFocus(node.dataset.fid);
      return;
    }
  }
}

function onContextMenu(e: MouseEvent) {
  if (overlayOff) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  markActivity();
  back();
}

function onWheel(e: WheelEvent) {
  if (overlayOff) return;
  e.preventDefault();
  const now = Date.now();
  if (now - lastWheel < 180 || !e.deltaY) return;
  lastWheel = now;
  markActivity();
  const action: Action = e.deltaY > 0 ? 'down' : 'up';
  if (!screenHandler?.(action, { wasIdle: false, wheel: true })) move(action);
}

export function installInput() {
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('mousemove', onMouseMove, true);
  window.addEventListener('contextmenu', onContextMenu, true);
  window.addEventListener('wheel', onWheel, { capture: true, passive: false });
  // Hide the cursor after 3 s without real mouse movement.
  setInterval(() => {
    if (!getState().cursorHidden && Date.now() - lastRealMove > 3000) setState({ cursorHidden: true });
  }, 1000);
}
