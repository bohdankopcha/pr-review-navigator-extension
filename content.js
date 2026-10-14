// PR Review Navigator
// Hold Cmd (Mac) / Ctrl (Windows/Linux) -> diff blocks get outlined, the one
// under the cursor gets a clickable overlay.
// Click overlay        -> toggle "Viewed"
// Click overlay + Alt  -> toggle collapse/expand
//
// Supports two GitHub PR UIs:
//  - "new" (.../pull/N/changes): React-based, diff blocks are
//    div[class*="diffEntry"], Viewed is a <button aria-pressed> labelled
//    "Viewed" / "Not Viewed".
//  - "old" (.../pull/N/files): Rails-rendered, diff blocks are
//    [data-tagsearch-path], Viewed is a hidden
//    <input type=checkbox class=js-reviewed-checkbox>.
//
// Performance: no MutationObserver and no per-block DOM work. Only ONE overlay
// element exists; it is moved into whichever block is under the cursor. The
// "all blocks" highlight is pure CSS keyed off a body class.

(function () {
  'use strict';

  const DEBUG = false;
  function log(...args) {
    if (DEBUG) console.log('[PRN]', ...args);
  }
  log('content script loaded on', location.href);

  // ---------- platform: Cmd on Mac, Ctrl everywhere else ----------

  const isMac =
    (navigator.userAgentData && navigator.userAgentData.platform === 'macOS') ||
    /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const PRIMARY_KEY = isMac ? 'Meta' : 'Control';
  function primaryHeld(e) {
    return isMac ? e.metaKey : e.ctrlKey;
  }
  document.body.classList.add(isMac ? 'prn-mac' : 'prn-win');

  // ---------- label resolution (Primer IconButtons use aria-labelledby) ----------

  function resolveLabel(el) {
    if (!el) return '';
    const own = el.getAttribute('aria-label');
    if (own) return own;
    const lb = el.getAttribute('aria-labelledby');
    if (!lb) return '';
    return lb
      .split(' ')
      .map((id) => {
        const target = document.getElementById(id);
        return target ? target.textContent.trim() : '';
      })
      .join(' ');
  }

  // ---------- diff block discovery (new + old UI) ----------

  const BLOCK_SELECTOR = 'div[class*="diffEntry"], [data-tagsearch-path]';

  function blockFrom(node) {
    return node && node.closest ? node.closest(BLOCK_SELECTOR) : null;
  }

  function findViewedControl(block) {
    // new UI: <button aria-pressed aria-label="Viewed|Not Viewed">
    const btn = [...block.querySelectorAll('button[aria-pressed]')].find((b) =>
      /^(not )?viewed$/i.test((b.getAttribute('aria-label') || '').trim())
    );
    if (btn) return btn;
    // old UI
    const header = block.querySelector('.file-header');
    if (!header) return null;
    let el = header.querySelector('input.js-reviewed-checkbox');
    if (el) return el;
    const label = [...header.querySelectorAll('label')].find((l) => /viewed/i.test(l.textContent));
    if (label) {
      el = label.querySelector('input[type="checkbox"]') || document.getElementById(label.getAttribute('for'));
      if (el) return el;
    }
    return header.querySelector('input[type="checkbox"][aria-label*="viewed" i]') || null;
  }

  function findCollapseControl(block) {
    // old UI
    const header = block.querySelector('.file-header');
    if (header) {
      const btn = header.querySelector('.js-details-target');
      if (btn) return btn;
    }
    // new UI: first few buttons, find the one labelled "Collapse file" / "Expand file"
    const candidates = [...block.querySelectorAll('button')].slice(0, 6);
    return candidates.find((b) => /^(collapse|expand) file$/i.test(resolveLabel(b).trim())) || null;
  }

  // ---------- actions ----------

  function flash(block) {
    block.classList.add('prn-flash');
    setTimeout(() => block.classList.remove('prn-flash'), 350);
  }

  function toggleReviewed(block) {
    const control = findViewedControl(block);
    log('toggle viewed', control);
    if (control) control.click();
    else block.classList.toggle('prn-marked-reviewed');
    flash(block);
  }

  function toggleCollapse(block) {
    const btn = findCollapseControl(block);
    log('toggle collapse', btn);
    if (btn) btn.click();
    flash(block);
  }

  // ---------- overlay (single element, moved to the hovered block) ----------

  const overlay = document.createElement('div');
  overlay.className = 'prn-overlay';
  const tag = document.createElement('span');
  tag.className = 'prn-overlay-tag';
  overlay.appendChild(tag);

  let active = false;
  let altActive = false;
  let lastTarget = null; // last element under the cursor
  let currentBlock = null;

  function placeOverlay() {
    const block = blockFrom(lastTarget);
    if (block === currentBlock && overlay.parentElement === block) return;
    currentBlock = block;
    if (!block) {
      overlay.remove();
      return;
    }
    if (getComputedStyle(block).position === 'static') block.classList.add('prn-relative');
    block.appendChild(overlay);
  }

  function activate() {
    if (active) return;
    active = true;
    document.body.classList.add('prn-cmd-active');
    placeOverlay();
    log('ON');
  }

  function deactivate() {
    if (!active) return;
    active = false;
    currentBlock = null;
    overlay.remove();
    document.body.classList.remove('prn-cmd-active');
    setAlt(false);
    log('OFF');
  }

  function setAlt(isAlt) {
    if (altActive === isAlt) return;
    altActive = isAlt;
    document.body.classList.toggle('prn-alt-active', isAlt);
  }

  // Delegated, capture-phase: resolve the block fresh at click time so React
  // re-renders replacing nodes can't break anything.
  document.addEventListener(
    'click',
    function (e) {
      if (e.target !== overlay && !overlay.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const block = overlay.parentElement;
      if (!block) return;
      if (e.altKey) toggleCollapse(block);
      else toggleReviewed(block);
    },
    true
  );

  document.addEventListener(
    'keydown',
    function (e) {
      if (e.key === PRIMARY_KEY || primaryHeld(e)) {
        activate();
        setAlt(e.altKey);
      }
    },
    true
  );

  document.addEventListener(
    'keyup',
    function (e) {
      if (e.key === PRIMARY_KEY || !primaryHeld(e)) deactivate();
      else if (e.key === 'Alt') setAlt(false);
    },
    true
  );

  // Cheap: only does work when the element under the cursor changes.
  document.addEventListener(
    'mousemove',
    function (e) {
      const held = primaryHeld(e);
      if (!held) {
        lastTarget = e.target;
        if (active) deactivate();
        return;
      }
      if (!active) {
        lastTarget = e.target;
        activate();
      } else if (e.target !== lastTarget && e.target !== overlay && !overlay.contains(e.target)) {
        lastTarget = e.target;
        placeOverlay();
      }
      setAlt(e.altKey);
    },
    { capture: true, passive: true }
  );

  window.addEventListener('blur', deactivate);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) deactivate();
  });

  // ---------- one-time hint ----------

  const HINT_KEY = 'prn-hint-shown';
  if (!localStorage.getItem(HINT_KEY)) {
    const primaryLabel = isMac ? '⌘' : 'Ctrl';
    const altLabel = isMac ? '⌥' : 'Alt';
    const hint = document.createElement('div');
    hint.className = 'prn-hint';
    hint.innerHTML =
      '<strong>PR Review Navigator</strong><br>' +
      `Hold ${primaryLabel} — hover a diff block<br>` +
      'Click — toggle Viewed<br>' +
      `Click + ${altLabel} — collapse/expand`;
    document.body.appendChild(hint);
    localStorage.setItem(HINT_KEY, '1');
    setTimeout(() => hint.classList.add('prn-hint--hide'), 7000);
    setTimeout(() => hint.remove(), 7800);
  }
})();
