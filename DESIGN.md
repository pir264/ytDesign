# YouTube TV: design handoff

A YouTube front-end for a TV. It runs fullscreen in a browser on a PC and is used from across the room, with **keyboard only** (arrows, Enter, Esc, S, Space). Show only what matters. Text must be readable at about 3 m.

## Files in this folder

| File | What it is |
| --- | --- |
| `Prototype.dc.html` | **Main reference.** All screens and the navigation between them in one file (state machine in the `<script>` at the bottom). |
| `Main.dc.html` | Home screen layout |
| `Search.dc.html` | Search while typing |
| `Results.dc.html` | Search results grid |
| `Player.dc.html` | Fullscreen player with the details side panel open |

The `.dc.html` files use a design-canvas template format (`<x-dc>`, `<sc-for>`, `<sc-if>`, `{{holes}}`, `class Component extends DCLogic`). Treat them as **visual and behavioural reference only**. Copy the sizes, colours and layout from the inline styles, then rebuild them in normal HTML/JS or your framework of choice. Do not try to run that format.

## Design rules

- **Canvas:** design at 1920×1080. Scale the whole UI to the viewport, keeping the 16:9 layout.
- **Safe area:** 96px side margins, 48px top.
- **Minimum text size 22px.** Body/tile titles 26px (max 2 lines, then ellipsis), detail titles 48–56px, section headings 34px.
- **Font:** Montserrat (400/500/600/700/900).
- **Colours:**
  - background `#0a1a36`, player background `#05101f`
  - tile/surface blues `#0f2450`, `#143062`, `#1d4180`, `#2b569c`
  - text `#ffffff`, secondary text `#b9cbe2`, quiet links `#7d9ac4`
  - **focus/accent `#ed7126`** (orange)
- **Focus:** exactly one focused element at a time. A focused tile scales 1.05–1.06 and gets a 6px orange outline with a 4px offset and a soft shadow. Unfocused tiles are at 0.8 opacity. The details area at the top of a screen always shows the focused item's full title + metadata.
- **Quiet chrome:** search, Home, History, Playlists and Subscriptions are small, muted controls in a top bar (120px tall). No keyboard-hint bars.
- **No clutter:** tiles show only the thumbnail, title, duration badge and a watch-progress bar (when partially watched). No view counts or descriptions on tiles.

## Screens

1. **Home**
   - Top bar: Search pill, then the links Home · History · Playlists · Subscriptions (current page highlighted), clock on the right.
   - Details block for the focused video.
   - Row "Continue watching" (400×225 tiles, 40px gap, row runs off the right edge).
   - Dimmed next row "Subscriptions".
2. **Search (typing)**
   - Search becomes **prominent**: a 1440×136 white bar, 60px text, orange focus ring, a Search button and a ✕ close button.
   - Suggestions below as 80px rows; the focused row is filled `#1d4180` with an orange outline.
   - Recent searches as chips.
3. **Search results**
   - Search shrinks back to the quiet top bar.
   - An orange eyebrow line "Results for "<query>" · N" above the focused result's title.
   - 4-column grid of 16:9 tiles.
4. **History / Playlists / Subscriptions**
   - Page title + one-line subtitle, then a 4-column grid.
   - Subscriptions adds a strip of round channel avatars above the grid.
   - Playlists: the tile badge shows the video count; Enter plays the first video.
5. **Player (fullscreen)**
   - The video fills the screen.
   - Overlay at the bottom: title, channel, thick progress bar (orange played part, white knob), big round controls (rewind 10 s, play/pause 120px with focus ring, forward 10 s). Auto-hide after 4 s of no input, show again on any key.
   - Top-left **Back** button; top-right **Details** button.
6. **Details side panel** (in the player)
   - 640px, slides in from the right; the player controls shift left so they stay visible.
   - Contents: header with ✕, channel (avatar, name, subscriber count, "Go to channel"), description (max 5 lines), "Comments · count" and the top 3 comments (max 3 lines each).

## Navigation and Back

| From | Enter / click | Back (Esc) |
| --- | --- | --- |
| Home | play focused video | (none) |
| Search | show results | screen search was opened from |
| Results | play focused video | Home |
| History / Playlists / Subscriptions | play video (playlist → first video) | Home |
| Player | play/pause | **the screen the video was opened from**, same tile still focused |
| Details panel | (none) | close panel |

- Each screen remembers its focused tile when you come back.
- The details panel closes when a new video starts.
- `S` opens search from any non-player screen.

## Keyboard mapping

- **Arrows:** move focus spatially between tiles, top-bar links and buttons. Use a spatial navigation library (e.g. `@noriginmedia/norigin-spatial-navigation`) or a small custom focus manager.
- **Enter:** activate.
- **Esc / Backspace:** Back, as in the table above. Backspace must still delete text while the search input is focused.
- **S:** open search.
- **In the player:**
  - Space: play/pause
  - ← / →: seek 10 s
  - ↑: show the controls
  - Details button reachable with ↑ then →

## Implementation notes

- **Playback:** use the YouTube IFrame Player API with `controls=0`, so the custom overlay is the only UI.
- **Data:** search, playlists, subscriptions, channel info and comments (`commentThreads`) come from the YouTube Data API v3. Playlists and subscriptions need OAuth; there is a daily quota.
- **History:** the YouTube API has not exposed watch history since around 2016. Record what this app plays locally (e.g. in localStorage or a small backend) and build the History page from that.
- **Fullscreen:** run Chromium in kiosk mode (`chromium --kiosk <url>`) on the TV PC. Esc is then free for in-app Back.
- **Sample data:** the video titles, channels, descriptions and comments in the prototypes are placeholders.
