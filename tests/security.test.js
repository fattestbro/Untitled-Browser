const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root,'src/main/main.js'),'utf8');
const styles = fs.readFileSync(path.join(root,'src/renderer/internal.css'),'utf8');
const index = fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8');

test('remote BrowserView has no trusted preload',()=>{
  const createTab = main.slice(main.indexOf('function createTab'), main.indexOf('function closeTab'));
  assert.doesNotMatch(createTab, /preload:\s*path\.join\(__dirname, ['"]\.\.[/\\]preload/);
  assert.match(createTab,/contextIsolation:\s*true/);
  assert.match(createTab,/sandbox:\s*true/);
});

test('security handlers and navigation checks exist',()=>{
  assert.match(main,/trustedHandle\('external:open'/);
  assert.match(main,/isTrustedIpcSender/);
  assert.match(main,/setPermissionCheckHandler/);
  assert.match(main,/will-navigate/);
  assert.match(main,/will-redirect/);
  assert.match(main,/setWindowOpenHandler/);
});

test('security settings support DNS, proxy and split tunneling',()=>{
  assert.match(main,/configureHostResolver/);
  assert.match(main,/proxy\.mode === 'split'/);
  assert.match(main,/createProxyPac/);
  assert.match(main,/closeAllConnections/);
});

test('error overlay targets the sheet by percentages',()=>{
  assert.match(styles,/left:71\.5%/);
  assert.match(styles,/top:58\.9%/);
  assert.match(styles,/width:48\.8%/);
  assert.match(styles,/height:19\.6%/);
});

test('tab favicon event is wired',()=>assert.match(main,/page-favicon-updated/));

test('shell CSP permits favicons/background images but keeps scripts local',()=>{ assert.match(index,/script-src 'self'/); assert.match(index,/img-src 'self' data: file: https:/); assert.doesNotMatch(index,/script-src\s+[^;>]*https?:/); });
