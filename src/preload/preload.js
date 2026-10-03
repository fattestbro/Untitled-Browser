const { contextBridge, ipcRenderer } = require('electron');
const listeners = new Map();
function on(channel, fn) {
  const wrapped = (_event, payload) => fn(payload);
  listeners.set(fn, wrapped);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}
contextBridge.exposeInMainWorld('untitled', {
  search: { suggestions: (query, searchEngine) => ipcRenderer.invoke('search:suggestions', { query, searchEngine }) },
  tabs: {
    create: (url, incognito=false) => ipcRenderer.invoke('tabs:create', { url, incognito }),
    close: id => ipcRenderer.invoke('tabs:close', id),
    activate: id => ipcRenderer.invoke('tabs:activate', id),
    navigate: value => ipcRenderer.invoke('tabs:navigate', value),
    internal: (route, params = {}) => ipcRenderer.invoke('tabs:internal', { route, params }),
    reload: hard => ipcRenderer.invoke('tabs:reload', hard),
    action: action => ipcRenderer.invoke('tabs:action', action),
    duplicate: id => ipcRenderer.invoke('tabs:duplicate', id),
    reorder: (from,to) => ipcRenderer.invoke('tabs:reorder', {from,to}),
    onState: fn => on('tabs:state', fn),
    restoreClosed: ()=>ipcRenderer.invoke('tabs:restore-closed'),
    onActive: fn => on('tab:active', fn)
  },
  history: {
    get: () => ipcRenderer.invoke('history:get'),
    delete: indices => ipcRenderer.invoke('history:delete', indices),
    clear: () => ipcRenderer.invoke('history:clear')
  },
  downloads: { get:()=>ipcRenderer.invoke('downloads:get'), open:p=>ipcRenderer.invoke('downloads:open',p), show:p=>ipcRenderer.invoke('downloads:show',p), onChanged:fn=>on('downloads:changed',fn) },
  bookmarks: { get:()=>ipcRenderer.invoke('bookmarks:get'), add:i=>ipcRenderer.invoke('bookmarks:add',i), delete:id=>ipcRenderer.invoke('bookmarks:delete',id), is:u=>ipcRenderer.invoke('bookmarks:is',u), onChanged:fn=>on('bookmarks:changed',fn) },
  settings: { get:()=>ipcRenderer.invoke('settings:get'), set:s=>ipcRenderer.invoke('settings:set',s), onState:fn=>on('settings:state',fn), chooseBackground:()=>ipcRenderer.invoke('settings:choose-background'), clearBackground:()=>ipcRenderer.invoke('settings:clear-background'), chooseDownloadFolder:()=>ipcRenderer.invoke('settings:choose-download-folder') },
  security: { apply:()=>ipcRenderer.invoke('security:apply'), restartInfo:()=>ipcRenderer.invoke('security:restart-required') },
  discord: { status:()=>ipcRenderer.invoke('discord:status'), test:()=>ipcRenderer.invoke('discord:test'), onStatus:fn=>on('discord:status',fn) },
  privacy: { clear: x=>ipcRenderer.invoke('privacy:clear',x) },
  screenshot: { current:()=>ipcRenderer.invoke('screenshot:current') },
  menu: { toggle:()=>ipcRenderer.invoke('menu:toggle'), close:()=>ipcRenderer.invoke('menu:close') },
  window: { minimize:()=>ipcRenderer.invoke('window:minimize'), maximize:()=>ipcRenderer.invoke('window:maximize'), close:()=>ipcRenderer.invoke('window:close'), onMaximized:fn=>on('window:maximized',fn) },
  shell: { openPath:p=>ipcRenderer.invoke('shell:openPath',p), showInFolder:p=>ipcRenderer.invoke('shell:showInFolder',p), external:u=>ipcRenderer.invoke('external:open',u) },
  clipboard: { writeText:v=>ipcRenderer.invoke('clipboard:writeText',v) },
  metrics: { get:()=>ipcRenderer.invoke('app:metrics') },
  extensions: { list:()=>ipcRenderer.invoke('extensions:list'), load:p=>ipcRenderer.invoke('extensions:load',p), remove:id=>ipcRenderer.invoke('extensions:remove',id) },
  app: { paths:()=>ipcRenderer.invoke('app:paths'), version:()=>ipcRenderer.invoke('browser:version') },
  session: { save:()=>ipcRenderer.invoke('session:save'), clear:()=>ipcRenderer.invoke('session:clear') },
  onToast: fn=>on('toast', fn),
  onInternalShow: fn=>on('internal:show', fn),
  onInternalHide: fn=>on('internal:hide', fn),
  onHistoryChanged: fn=>on('history:changed', fn)
});
