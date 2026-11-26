// TwinDesk / DuoDesk — Universal i18n engine (Node.js Main Process + Browser Renderer).
// Copyright (C) 2026 inukaasith / DuoDesk Japanese Localization. GPL-3.0, see LICENSE.
// Supports 'auto' (follows OS/browser locale), 'ja' (Japanese), and 'en' (English).
// In Node.js tests, defaults to 'en' until initFromSettings() or setLang() is called,
// keeping existing English-assertion tests passing on any OS locale.
'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./i18n-ja.js'), true);
  } else {
    root.DuoDeskI18n = factory(root.DuoDeskI18nJa || { EXACT: {}, PATTERNS: [] }, false);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (jaDict, isNode) {
  const VALID = new Set(['auto', 'ja', 'en']);
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'SVG', 'PATH', 'NOSCRIPT']);
  const ATTRS = ['placeholder', 'aria-label', 'title'];

  let pref = isNode ? 'en' : 'auto';
  let active = resolve(pref);
  const listeners = new Set();
  const origNodeText = typeof WeakMap === 'function' ? new WeakMap() : null;
  const origElAttrs = typeof WeakMap === 'function' ? new WeakMap() : null;
  let observer = null;
  let applying = false;

  function detectSystemLang() {
    try {
      if (typeof process !== 'undefined' && process.env && process.env.DUODESK_LANG) {
        const e = String(process.env.DUODESK_LANG).toLowerCase();
        if (e.startsWith('ja')) return 'ja';
        if (e.startsWith('en')) return 'en';
      }
    } catch (_) {}
    try {
      if (typeof navigator !== 'undefined' && navigator.language) {
        return String(navigator.language).toLowerCase().startsWith('ja') ? 'ja' : 'en';
      }
    } catch (_) {}
    try {
      const loc = Intl.DateTimeFormat().resolvedOptions().locale || '';
      if (String(loc).toLowerCase().startsWith('ja')) return 'ja';
    } catch (_) {}
    try {
      if (typeof process !== 'undefined' && process.env) {
        const envLoc = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '';
        if (String(envLoc).toLowerCase().startsWith('ja')) return 'ja';
      }
    } catch (_) {}
    return 'en';
  }

  function resolve(lang) {
    if (lang === 'ja') return 'ja';
    if (lang === 'en') return 'en';
    return detectSystemLang();
  }

  function normalizeLang(v) {
    return VALID.has(v) ? v : 'auto';
  }

  function translateJa(text) {
    if (typeof text !== 'string' || !text) return text;
    const trimmed = text.trim();
    if (!trimmed) return text;

    const lead = text.slice(0, text.indexOf(trimmed));
    const trail = text.slice(text.indexOf(trimmed) + trimmed.length);

    if (Object.prototype.hasOwnProperty.call(jaDict.EXACT, trimmed)) {
      return lead + jaDict.EXACT[trimmed] + trail;
    }
    // Normalize straight vs curly apostrophes for matching
    const curly = trimmed.replace(/'/g, '’');
    if (curly !== trimmed && Object.prototype.hasOwnProperty.call(jaDict.EXACT, curly)) {
      return lead + jaDict.EXACT[curly] + trail;
    }
    const straight = trimmed.replace(/’/g, "'");
    if (straight !== trimmed && Object.prototype.hasOwnProperty.call(jaDict.EXACT, straight)) {
      return lead + jaDict.EXACT[straight] + trail;
    }

    for (const [re, rep] of jaDict.PATTERNS) {
      if (re.test(trimmed)) {
        return lead + trimmed.replace(re, rep) + trail;
      }
    }
    return text;
  }

  function t(text, vars) {
    if (typeof text !== 'string') return text;
    let out = active === 'ja' ? translateJa(text) : text;
    if (vars && typeof vars === 'object') {
      out = out.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m));
    }
    return out;
  }

  function isSkippedElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.hasAttribute && el.hasAttribute('data-no-i18n')) return true;
    if (el.classList && (el.classList.contains('code') || el.classList.contains('value'))) return true;
    return false;
  }

  function hasSkippedAncestor(node) {
    let cur = node.nodeType === 1 ? node : node.parentElement;
    while (cur) {
      if (isSkippedElement(cur)) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  function translateTextNode(node) {
    if (!node || node.nodeType !== 3 || !origNodeText) return;
    if (hasSkippedAncestor(node)) return;
    const cur = node.nodeValue || '';
    if (!cur.trim()) return;

    let orig = origNodeText.get(node);
    if (orig === undefined) {
      orig = cur;
      origNodeText.set(node, orig);
    } else {
      // If app code programmatically overwrote the text node with a new English string, update orig.
      const expected = active === 'ja' ? translateJa(orig) : orig;
      if (cur !== expected && cur !== orig) {
        orig = cur;
        origNodeText.set(node, orig);
      }
    }

    const next = active === 'ja' ? translateJa(orig) : orig;
    if (cur !== next) {
      node.nodeValue = next;
    }
  }

  function translateElementAttrs(el) {
    if (!el || el.nodeType !== 1 || !origElAttrs || isSkippedElement(el)) return;
    let map = origElAttrs.get(el);
    for (const attr of ATTRS) {
      if (!el.hasAttribute(attr)) continue;
      const cur = el.getAttribute(attr) || '';
      if (!cur.trim()) continue;
      if (!map) {
        map = {};
        origElAttrs.set(el, map);
      }
      if (map[attr] === undefined) {
        map[attr] = cur;
      } else {
        const expected = active === 'ja' ? translateJa(map[attr]) : map[attr];
        if (cur !== expected && cur !== map[attr]) map[attr] = cur;
      }
      const next = active === 'ja' ? translateJa(map[attr]) : map[attr];
      if (cur !== next) el.setAttribute(attr, next);
    }
  }

  function translateDom(rootEl) {
    if (typeof document === 'undefined') return;
    const target = rootEl || document.body || document.documentElement;
    if (!target) return;
    applying = true;
    try {
      if (document.documentElement) {
        document.documentElement.lang = active;
      }
      if (target.nodeType === 1) translateElementAttrs(target);
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (n.nodeType === 3) translateTextNode(n);
        else if (n.nodeType === 1) translateElementAttrs(n);
      }
    } finally {
      applying = false;
    }
  }

  function observeDom(rootEl) {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    const target = rootEl || document.body || document.documentElement;
    if (!target) return;
    translateDom(target);
    if (observer) observer.disconnect();
    observer = new MutationObserver((mutations) => {
      if (applying) return;
      applying = true;
      try {
        for (const m of mutations) {
          if (m.type === 'characterData') {
            translateTextNode(m.target);
          } else if (m.type === 'attributes') {
            translateElementAttrs(m.target);
          } else if (m.type === 'childList') {
            for (const added of m.addedNodes) {
              if (added.nodeType === 3) translateTextNode(added);
              else if (added.nodeType === 1) translateDom(added);
            }
          }
        }
      } finally {
        applying = false;
      }
    });
    observer.observe(target, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });
  }

  function setLang(lang) {
    const nextPref = normalizeLang(lang);
    const nextActive = resolve(nextPref);
    const changed = nextPref !== pref || nextActive !== active;
    pref = nextPref;
    active = nextActive;
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem('duodesk.lang', pref); } catch (_) {}
    }
    if (typeof document !== 'undefined') {
      translateDom(document.body || document.documentElement);
    }
    if (changed) {
      for (const fn of listeners) {
        try { fn(active, pref); } catch (_) {}
      }
    }
    return active;
  }

  function initFromSettings(settings) {
    const lang = settings && settings.app && settings.app.lang ? settings.app.lang : 'auto';
    return setLang(lang);
  }

  function getLang() { return pref; }
  function getActiveLang() { return active; }
  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // Browser auto-bootstrap: restore cached preference and observe DOM once ready.
  if (!isNode && typeof document !== 'undefined') {
    try {
      const saved = typeof localStorage !== 'undefined' && localStorage.getItem('duodesk.lang');
      if (saved && VALID.has(saved)) {
        pref = saved;
        active = resolve(pref);
      }
    } catch (_) {}
    const boot = () => observeDom(document.body || document.documentElement);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  }

  return {
    t,
    setLang,
    getLang,
    getActiveLang,
    normalizeLang,
    detectSystemLang,
    initFromSettings,
    translateDom,
    observeDom,
    onChange,
  };
});
