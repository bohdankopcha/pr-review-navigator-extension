// PR Review Navigator
// Hold Cmd (Mac) / Ctrl (Windows/Linux) -> gray overlay appears over each diff block.
// Click overlay        -> toggle "Viewed"
// Click overlay + Alt  -> toggle collapse/expand
//
// Supports two GitHub PR UIs:
//  - "new" (.../pull/N/changes): React-based, diff blocks are
//    div[class*="diffEntry"], Viewed is a <button>.
//  - "old" (.../pull/N/files): Rails-rendered, diff blocks are
//    [data-tagsearch-path], Viewed is a hidden
//    <input type=checkbox class=js-reviewed-checkbox>.

(function () {
  'use strict';

  const DEBUG = true;
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
  log('platform:', isMac ? 'mac (Cmd)' : 'win/linux (Ctrl)');

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

  function allDiffBlocks() {
    const newBlocks = [...document.querySelectorAll('div[class*="diffEntry"]')];
    const oldBlocks = [...document.querySelectorAll('[data-tagsearch-path]')];
    return newBlocks.length ? newBlocks : oldBlocks;
  }

  function findViewedControl(block) {
    // new UI
    let el = block.querySelector('button[class*="MarkAsViewedButton"]');
    if (el) return el;
    // old UI
    const header = block.querySelector('.file-header');
    if (!header) return null;
    el = header.querySelector('input.js-reviewed-checkbox');
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
    if (!block) return;
    block.classList.add('prn-flash');
    setTimeout(() => block.classList.remove('prn-flash'), 350);
  }

  function toggleReviewed(block) {
    if (!block) return;
    const control = findViewedControl(block);
    if (control) {
      control.click();
    } else {
      block.classList.toggle('prn-marked-reviewed');
    }
    flash(block);
  }

  function toggleCollapse(block) {
    if (!block) return;
    const btn = findCollapseControl(block);
    if (btn) btn.click();
    flash(block);
  }

  function handleToggle(block, altHeld) {
    if (altHeld) toggleCollapse(block);
    else toggleReviewed(block);
  }

  // ---------- overlay management ----------

  let overlaysActive = false;
  let altActive = false;
  let mo = null;

  // Single delegated listener instead of one per overlay: React sometimes
  // replaces a block's DOM node (re-render), which would silently detach a
  // listener bound directly to that node. Delegating to document and
  // resolving the target fresh at click-time is immune to that.
  document.addEventListener(
    'click',
    function (e) {
      const overlay = e.target.closest && e.target.closest('.prn-overlay');
      if (!overlay) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const target = overlay.parentElement;
      log('overlay click', target && (target.id || target.className));
      if (!target) return;

      handleToggle(target, e.altKey);
    },
    true
  );

  function makeOverlay(target) {
    if (target.querySelector(':scope > .prn-overlay')) return;
    if (getComputedStyle(target).position === 'static') {
      target.classList.add('prn-relative');
    }
    const overlay = document.createElement('div');
    overlay.className = 'prn-overlay';

    const tag = document.createElement('span');
    tag.className = 'prn-overlay-tag';
    overlay.appendChild(tag);

    target.appendChild(overlay);
  }

  function addOverlays() {
    const blocks = allDiffBlocks();
    blocks.forEach((el) => makeOverlay(el));
    log('overlays added:', blocks.length, 'diff blocks');
  }

  function removeOverlays() {
    document.querySelectorAll('.prn-overlay').forEach((el) => el.remove());
  }

  function activateOverlays() {
    if (overlaysActive) return;
    overlaysActive = true;
    log('overlays ON');
    addOverlays();
    document.body.classList.add('prn-cmd-active');
    mo = new MutationObserver(() => addOverlays());
    mo.observe(document.body, { childList: true, subtree: true });
  }

  function deactivateOverlays() {
    if (!overlaysActive) return;
    overlaysActive = false;
    log('overlays OFF');
    if (mo) {
      mo.disconnect();
      mo = null;
    }
    removeOverlays();
    document.body.classList.remove('prn-cmd-active');
  }

  function updateAltMode(isAlt) {
    if (altActive === isAlt) return;
    altActive = isAlt;
    document.body.classList.toggle('prn-alt-active', isAlt);
  }

  document.addEventListener(
    'keydown',
    function (e) {
      if (e.key === PRIMARY_KEY || primaryHeld(e)) {
        activateOverlays();
        updateAltMode(e.altKey);
      }
      if (e.key === 'Alt' && overlaysActive) updateAltMode(true);
    },
    true
  );

  document.addEventListener(
    'keyup',
    function (e) {
      if (e.key === PRIMARY_KEY || !primaryHeld(e)) deactivateOverlays();
      if (e.key === 'Alt') updateAltMode(false);
    },
    true
  );

  document.addEventListener(
    'mousemove',
    function (e) {
      if (primaryHeld(e) && !overlaysActive) activateOverlays();
      if (!primaryHeld(e) && overlaysActive) deactivateOverlays();
      if (overlaysActive) updateAltMode(e.altKey);
    },
    true
  );

  window.addEventListener('blur', deactivateOverlays);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) deactivateOverlays();
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
      `Hold ${primaryLabel} — gray overlay appears on diff blocks<br>` +
      'Click overlay — toggle Viewed<br>' +
      `Click overlay + ${altLabel} — collapse/expand`;
    document.body.appendChild(hint);
    localStorage.setItem(HINT_KEY, '1');
    setTimeout(() => hint.classList.add('prn-hint--hide'), 7000);
    setTimeout(() => hint.remove(), 7800);
  }
})();
