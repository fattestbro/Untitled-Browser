const $ = s => document.querySelector(s);
const tabsRow = $('#tabsRow');
const address = $('#address');
const toast = $('#toast');
let state = { tabs: [], activeTabId: null, settings: null };
let suggestionTimer = null;
let suggestionRequest = 0;
let suggestionIndex = -1;
const ICON_PLUS = '+';
function showToast(message){ toast.textContent=message; toast.classList.remove('hidden'); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>toast.classList.add('hidden'),2600); }
function iconSvg(type){ const stroke="currentColor"; const paths={menu:`<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>`,bookmark:`<path d="M6 4h12v16l-6-3-6 3z"/>`}; return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.7">${paths[type]||''}</svg>`; }
function renderTabs(){
  tabsRow.innerHTML='';
  let draggedId=null;
  state.tabs.forEach(t=>{
    const el=document.createElement('div');
    el.className='tab'+(t.id===state.activeTabId?' active':'');
    el.dataset.id=t.id;
    el.draggable=true;
    el.innerHTML=`<div class="favicon">${t.incognito?'<span class="private-favicon">P</span>':(t.favicon?`<img src="${escapeAttr(t.favicon)}" alt="">`:'<span class="default-favicon">◈</span>')}</div><div class="title">${escapeHtml(t.title||'New Tab')}</div><button class="close" aria-label="Close">×</button>`;
    el.onclick=()=>window.untitled.tabs.activate(t.id);
    el.querySelector('.close').onclick=(e)=>{e.stopPropagation();window.untitled.tabs.close(t.id)};
    el.oncontextmenu=(e)=>{e.preventDefault(); if(confirm('Duplicate this tab?')) window.untitled.tabs.duplicate(t.id);};
    el.addEventListener('dragstart',()=>{draggedId=t.id;});
    el.addEventListener('dragover',e=>e.preventDefault());
    el.addEventListener('drop',e=>{e.preventDefault(); if(draggedId && draggedId!==t.id) window.untitled.tabs.reorder(draggedId,t.id); draggedId=null;});
    tabsRow.appendChild(el);
  });
  const n=document.createElement('button'); n.className='new-tab'; n.textContent=ICON_PLUS; n.onclick=()=>window.untitled.tabs.create('untitled://newtab'); tabsRow.appendChild(n);
}
function escapeAttr(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function setActive(t){ if(!t)return; state.activeTabId=t.id; address.value=t.url||''; $('#securityDot').classList.toggle('secure',/^https:/.test(t.url||'')); hideSuggestions(); renderTabs(); }
async function bookmarkCurrent(){ const t=state.tabs.find(x=>x.id===state.activeTabId); if(!t||!/^https?:/i.test(t.url||''))return showToast('Nothing to bookmark'); await window.untitled.bookmarks.add({title:t.title,url:t.url}); showToast('Bookmarked'); }
function openInternal(route, params={}){ window.untitled.tabs.internal(route, params); }
function menuAction(action){ if(['history','downloads','bookmarks','settings','about','extensions','privacy','performance','task-manager','shortcuts','security'].includes(action)) return openInternal(action); return window.untitled.tabs.action(action); }
$('#menuBtn').innerHTML=iconSvg('menu'); $('#bookmarkBtn').innerHTML=iconSvg('bookmark');
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>window.untitled.tabs.action(b.dataset.action));
$('#bookmarkBtn').onclick=bookmarkCurrent; $('#pipBtn').onclick=()=>window.untitled.tabs.action('pip'); $('#menuBtn').onclick=()=>window.untitled.menu.toggle();
function hideSuggestions(){ const box=$('#searchSuggestions'); if(box){box.classList.remove('visible'); box.innerHTML='';} suggestionIndex=-1; }
function commitSuggestion(value){ if(!value)return; address.value=value; hideSuggestions(); window.untitled.tabs.navigate(value); address.blur(); }
function renderSuggestions(items){
  const box=$('#searchSuggestions'); if(!box)return;
  if(!items.length || document.activeElement!==address){ hideSuggestions(); return; }
  box.innerHTML=items.map((item,i)=>`<button type="button" class="suggestion-item${i===suggestionIndex?' selected':''}" data-index="${i}"><span class="suggestion-icon">⌕</span><span>${escapeHtml(item)}</span></button>`).join('');
  box.querySelectorAll('.suggestion-item').forEach(btn=>{
    btn.onmousedown=e=>{e.preventDefault(); commitSuggestion(items[Number(btn.dataset.index)]);};
  });
  box.classList.add('visible');
}
async function updateSuggestions(){
  const q=address.value.trim();
  if(!q || q.includes('://') || (!q.includes(' ') && q.includes('.'))){hideSuggestions();return;}
  const req=++suggestionRequest;
  const result=await window.untitled.search.suggestions(q,state.settings?.searchEngine||'https://duckduckgo.com/?q=');
  if(req!==suggestionRequest)return;
  renderSuggestions(result);
}
address.addEventListener('input',()=>{ clearTimeout(suggestionTimer); suggestionTimer=setTimeout(updateSuggestions,130); });
address.addEventListener('focus',()=>{ if(address.value.trim()) updateSuggestions(); });
address.addEventListener('blur',()=>setTimeout(hideSuggestions,120));
address.addEventListener('keydown',e=>{
  const box=$('#searchSuggestions'); const visible=box?.classList.contains('visible');
  if(visible && ['ArrowDown','ArrowUp'].includes(e.key)){
    e.preventDefault(); const count=box.querySelectorAll('.suggestion-item').length; if(!count)return;
    suggestionIndex=(suggestionIndex+(e.key==='ArrowDown'?1:-1)+count)%count;
    box.querySelectorAll('.suggestion-item').forEach((el,i)=>el.classList.toggle('selected',i===suggestionIndex));
    const selected=box.querySelector(`.suggestion-item:nth-child(${suggestionIndex+1})`); if(selected){address.value=selected.textContent.trim().replace(/^⌕\s*/,'');}
    return;
  }
  if(e.key==='Escape'){hideSuggestions();return;}
  if(e.key==='Enter'){hideSuggestions();window.untitled.tabs.navigate(address.value);address.blur();}
});
window.untitled.tabs.onState(p=>{state.tabs=p.tabs;state.activeTabId=p.activeTabId;renderTabs();});
window.untitled.settings.onState?.(s=>{state.settings=s;}); window.untitled.tabs.onActive(setActive); window.untitled.onInternalShow?.(p => window.untitledInternal?.render(p.route, p.params));
window.untitled.onInternalHide?.(() => window.untitledInternal?.hide()); window.untitled.onToast(p=>showToast(p.message));
window.untitled.onShortcutFocusAddress?.(()=>{ address.focus(); address.select(); });
window.untitled.onShortcutBookmark?.(()=>bookmarkCurrent());
window.addEventListener('load',async()=>{ state.settings=await window.untitled.settings.get(); window.untitledI18n?.apply(); });

$('#minBtn').onclick=()=>window.untitled.window.minimize();
$('#maxBtn').onclick=()=>window.untitled.window.maximize();
$('#closeBtn').onclick=()=>window.untitled.window.close();

