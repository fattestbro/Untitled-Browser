const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('internal renderer exists and exposes every required internal route', () => {
  const p = path.join(__dirname, '..', 'src', 'renderer', 'internal-ui.js');
  const s = fs.readFileSync(p, 'utf8');
  for (const route of ['history','downloads','bookmarks','extensions','settings','privacy','performance','task-manager','shortcuts','error']) {
    assert.match(s, new RegExp(`case['\"]${route}`));
  }
});

test('shell has an internal panel and preload event bridge', () => {
  const html = fs.readFileSync(path.join(__dirname,'..','src','renderer','index.html'),'utf8');
  const pre = fs.readFileSync(path.join(__dirname,'..','src','preload','preload.js'),'utf8');
  assert.match(html, /id="internalPanel"/);
  assert.match(pre, /onInternalShow/);
  assert.match(pre, /onInternalHide/);
});
