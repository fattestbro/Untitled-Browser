const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname,'..');
test('feature menu contains real browser actions',()=>{const s=fs.readFileSync(path.join(root,'src/renderer/menu.html'),'utf8');for(const a of ['restore-closed','duplicate-tab','save-page','print-page','clear-site-data','copy-url','fullscreen','mute'])assert.match(s,new RegExp(`data-action="${a}"`));});
test('settings hide user-editable Discord application id',()=>{const s=fs.readFileSync(path.join(root,'src/renderer/internal-ui.js'),'utf8');assert.doesNotMatch(s,/id="rpcId"/);assert.match(s,/1555622761924272249/);});
test('download folder picker is connected',()=>{const m=fs.readFileSync(path.join(root,'src/main/main.js'),'utf8');const p=fs.readFileSync(path.join(root,'src/preload/preload.js'),'utf8');assert.match(m,/settings:choose-download-folder/);assert.match(p,/chooseDownloadFolder/);});
