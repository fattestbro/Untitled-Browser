document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>window.untitled.tabs.action(b.dataset.action));document.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>{const route=b.dataset.route;if(b.dataset.newtab==='1') window.untitled.tabs.create('untitled://'+route); else window.untitled.tabs.internal(route)});
window.untitledI18n?.apply();
