// TwinDesk / DuoDesk — Lightweight i18n for Android WebView assets (remote / viewer / audio).
// Copyright (C) 2026 inukaasith / DuoDesk Japanese Localization. GPL-3.0, see LICENSE.
'use strict';

(function () {
  const isJa = (() => {
    try {
      const params = new URLSearchParams(location.search);
      const q = params.get('lang');
      if (q === 'ja') return true;
      if (q === 'en') return false;
    } catch (_) {}
    return typeof navigator !== 'undefined' && String(navigator.language || '').toLowerCase().startsWith('ja');
  })();
  if (!isJa) return;

  const MAP = {
    'Remote': 'リモコン',
    'Rotate': '回転',
    'Keyboard': 'キーボード',
    'Keys': 'キー設定',
    'Close': '閉じる',
    'Turn on Remote': 'リモコンをオンにする',
    'Left click': '左クリック',
    'Right click': '右クリック',
    'Gamepad keys': 'ゲームパッドキー設定',
    'Reset': 'リセット',
    'Done': '完了',
    'Back': '戻る',
    'Start': 'スタート',
    'Up': '上',
    'Down': '下',
    'Left': '左',
    'Right': '右',
    'Mac screen': 'パソコン画面',
    'Mac sound': 'パソコン音声',
    'Waiting for the computer…': 'パソコンを待機中…',
    'Slide to move · tap to click · hold to right click': 'スライドで移動・タップでクリック・長押しで右クリック',
    'two fingers to scroll · two-finger tap to right click': '2本指でスクロール・2本指タップで右クリック',
  };

  function tr(s) {
    if (!s) return s;
    const t = s.trim();
    return Object.prototype.hasOwnProperty.call(MAP, t) ? MAP[t] : s;
  }

  function walk(root) {
    if (!root) return;
    document.documentElement.lang = 'ja';
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) {
        const next = tr(n.nodeValue);
        if (next !== n.nodeValue) n.nodeValue = next;
      } else if (n.nodeType === 1) {
        for (const a of ['aria-label', 'title', 'placeholder']) {
          if (n.hasAttribute(a)) {
            const cur = n.getAttribute(a);
            const next = tr(cur);
            if (next !== cur) n.setAttribute(a, next);
          }
        }
      }
    }
  }

  const run = () => {
    walk(document.body || document.documentElement);
    const mo = new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === 'characterData') {
          const next = tr(m.target.nodeValue);
          if (next !== m.target.nodeValue) m.target.nodeValue = next;
        } else if (m.type === 'childList') {
          for (const node of m.addedNodes) {
            if (node.nodeType === 3) {
              const next = tr(node.nodeValue);
              if (next !== node.nodeValue) node.nodeValue = next;
            } else if (node.nodeType === 1) {
              walk(node);
            }
          }
        }
      }
    });
    mo.observe(document.body || document.documentElement, { subtree: true, childList: true, characterData: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
