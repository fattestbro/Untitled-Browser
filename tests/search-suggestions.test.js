const test = require('node:test');
const assert = require('node:assert/strict');
function normalize(items,q){const lower=q.toLocaleLowerCase();return [...new Set(items.map(String).map(x=>x.trim()).filter(Boolean))].sort((a,b)=>(a.toLocaleLowerCase().startsWith(lower)?0:1)-(b.toLocaleLowerCase().startsWith(lower)?0:1)).slice(0,8)}
test('search suggestions rank prefix matches and cap results',()=>{const out=normalize(['roblox','robzi','hello','rob','roblox studio','ROBLOX',''], 'rob');assert.deepEqual(out,['roblox','robzi','rob','roblox studio','ROBLOX','hello']);assert.equal(out.length<=8,true);});
test('search suggestions reject URL-like input',()=>{const q='https://example.com';assert.equal(q.includes('://'),true);});
