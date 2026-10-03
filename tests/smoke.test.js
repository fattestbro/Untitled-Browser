const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('project contains expected browser entry points', () => {
  for (const rel of ['package.json','NO_BUILD.md','src/main/main.js','src/preload/preload.js','src/renderer/index.html','src/renderer/app.js','src/renderer/i18n.js','src/renderer/internal.js','assets/matoi/error-main.png']) {
    assert.equal(fs.existsSync(path.join(__dirname,'..',rel)), true, rel);
  }
});

test('browser is named Untitled Browser', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname,'..','package.json'),'utf8'));
  assert.equal(pkg.productName, 'Untitled Browser');
  assert.equal(pkg.name, 'untitled-browser');
});
