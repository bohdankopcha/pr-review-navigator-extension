# PR Review Navigator

A small Chrome extension for faster navigation through large GitHub PRs.

## What it does

- Hold **⌘ (Mac) / Ctrl (Windows/Linux)** — diff blocks get outlined, the one under the cursor gets a clickable overlay.
- **Click the overlay** — toggles GitHub's native "Viewed" button/checkbox. State is stored by GitHub itself, so it survives reloads and is visible to others as usual.
- **Alt + click the overlay** — collapses/expands that file's diff (GitHub's native "Collapse/Expand file" control).
- A one-time hint with the shortcuts shows on first use.

Works on both GitHub PR UIs: the new one (`/pull/N/changes`, React) and the old one (`/pull/N/files`, Rails) — the extension detects the markup automatically. If no native "Viewed" control can be found, the file falls back to a local-only reviewed mark (dims the diff) — just a visual cue, nothing saved server-side.

Overlays/shortcuts only apply to the diff blocks themselves, not the file tree sidebar — the sidebar in the new UI is virtualized (React mounts/unmounts rows as you scroll), which made clicks there unreliable, so that part was dropped.

## Install (developer mode)

1. Open `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `gh-review-extension` folder
5. Open any GitHub PR and try Ctrl/⌘+click and Ctrl/⌘+Alt+click on diff blocks

After every code change, click ⟳ (reload) on `chrome://extensions` **and** hard-refresh (`Ctrl/⌘+Shift+R`) the GitHub tab — content scripts don't re-inject into already-open tabs automatically.

## Structure

- `manifest.json` — Manifest V3, content script on `github.com/*/*/pull/*`
- `content.js` — all the logic (one delegated click handler, no dependencies)
- `styles.css` — overlay, flash animation, hint

## Known limitations

- Collapsed/expanded state isn't persisted across reloads — GitHub itself doesn't store it.
- New-UI selectors: blocks are `div[class*="diffEntry"]` (CSS-module class), Viewed is `button[aria-pressed]` labelled `Viewed`/`Not Viewed`, collapse is the button labelled `Collapse file`/`Expand file`. If GitHub changes the markup, update `BLOCK_SELECTOR` / `findViewedControl()` / `findCollapseControl()` in `content.js` (and the block selector in `styles.css`).
- Performance: there is no MutationObserver and only one overlay element, moved into the hovered block — keep it that way; per-block overlays + a body-wide observer froze large PRs (notably in Arc).
- Only tested on Chrome; Manifest V3 should work on Edge/Brave/Arc as-is. Firefox supports MV3 too but hasn't been tried — may need `browser_specific_settings`.
