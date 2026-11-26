// Unit tests for shared/i18n.js and shared/traymenu.js Japanese localization.
'use strict';

const assert = require('assert');
const i18n = require('../i18n.js');
const trayMenu = require('../traymenu.js');

// Default in Node.js is 'en' so existing English assertions never break on Japanese OS.
assert.strictEqual(i18n.getActiveLang(), 'en');
assert.strictEqual(i18n.t('General'), 'General');
assert.strictEqual(i18n.t('Connect To'), 'Connect To');

// Switch to Japanese explicitly
assert.strictEqual(i18n.setLang('ja'), 'ja');
assert.strictEqual(i18n.t('General'), '一般');
assert.strictEqual(i18n.t('Hardware acceleration'), 'ハードウェアアクセラレーション');
assert.strictEqual(i18n.t('Display language'), '表示言語');
assert.strictEqual(i18n.t('Codes match'), 'コードが一致');

// Curly vs straight apostrophe normalization
assert.strictEqual(i18n.t("Show the phone's wallpaper"), 'スマートフォンの壁紙を表示');
assert.strictEqual(i18n.t('Show the phone’s wallpaper'), 'スマートフォンの壁紙を表示');

// Regex patterns
assert.strictEqual(i18n.t('Waiting for Studio-Mac…'), 'Studio-Mac を待機中…');
assert.strictEqual(i18n.t('Connecting to Pixel 8…'), 'Pixel 8 に接続中…');
assert.strictEqual(i18n.t('Phase 2'), 'フェーズ 2');
assert.strictEqual(i18n.t('Update available: v2.6.0'), 'アップデートがあります: v2.6.0');

// Variable interpolation
assert.strictEqual(i18n.t('Let the other computer wake {me}', { me: 'Surface' }), '相手のパソコンから Surface をスリープ解除（Wake-on-LAN）');

// Tray menu localization in Japanese
const noop = () => {};
const jaMenu = trayMenu.template({
  status: 'Not connected',
  connected: false,
  found: [],
  byAddress: noop,
  lookAgain: noop,
  open: noop,
  quit: noop,
});
assert.strictEqual(jaMenu[0].label, '未接続');
assert.strictEqual(jaMenu[1].label, '接続先');
assert.strictEqual(jaMenu[1].submenu[0].label, '近くにデバイスが見つかりません');
assert.strictEqual(jaMenu[3].label, 'DuoDesk を開く…');
assert.strictEqual(jaMenu[4].label, 'DuoDesk を終了');

// Switch back to English
assert.strictEqual(i18n.setLang('en'), 'en');
assert.strictEqual(i18n.t('General'), 'General');
const enMenu = trayMenu.template({
  status: 'Not connected',
  connected: false,
  found: [],
  byAddress: noop,
  lookAgain: noop,
  open: noop,
  quit: noop,
});
assert.strictEqual(enMenu[1].label, 'Connect To');

console.log('i18n: all passed');
