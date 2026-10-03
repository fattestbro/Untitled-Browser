const { app, BrowserWindow, BrowserView, ipcMain, session, shell, dialog, clipboard, nativeImage, screen } = require('electron');
const { pathToFileURL } = require('url');
const https = require('https');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { DiscordRpcManager, FIXED_APPLICATION_ID } = require('./discord-rpc');

// Portable mode is enabled by START.cmd. Keep all browser data beside the project.
if (process.env.UNTITLED_PORTABLE === '1') {
  try { app.setPath('userData', path.join(process.cwd(), 'data')); } catch (_) {}
}


const APP_NAME = 'Untitled Browser';
const USER_DATA = () => app.getPath('userData');
const CONFIG_FILE = () => path.join(USER_DATA(), 'config.json');
const HISTORY_FILE = () => path.join(USER_DATA(), 'history.json');
const BOOKMARKS_FILE = () => path.join(USER_DATA(), 'bookmarks.json');
const DOWNLOADS_FILE = () => path.join(USER_DATA(), 'downloads.json');
const SESSION_FILE = () => path.join(USER_DATA(), 'session.json');
const INTERNAL_FILE = path.join(__dirname, '..', 'renderer', 'internal.html');
const INTERNAL_FILE_URL = pathToFileURL(INTERNAL_FILE).toString();
const INTERNAL_ROUTES = new Set(['newtab','history','downloads','bookmarks','extensions','settings','security','about','privacy','performance','task-manager','shortcuts','error']);
const ERROR_IMAGE = path.join(app.getAppPath(), 'assets', 'matoi', 'error-main.png');

let mainWindow;
let menuWindow = null;
let tabs = [];
let activeTabId = null;
let nextTabId = 1;let config = null;
let history = [];
let bookmarks = [];
let rpcStartTimestamp = Math.floor(Date.now() / 1000);
let rpcManager;

const defaultConfig = {
  theme: 'dark',
  searchEngine: 'https://duckduckgo.com/?q=',
  homePage: 'untitled://newtab',
  restoreSession: true,
  askDownloadLocation: false,
  downloadFolder: path.join(os.homedir(), 'Downloads'),
  clearDataOnExit: false,
  blockThirdPartyCookies: false,
  doNotTrack: true,
  autoplay: true,
  hardwareAcceleration: true,
  discord: {
    enabled: false,
    applicationId: FIXED_APPLICATION_ID,
    showSite: true,
    showSearch: true,
    showTitle: true,
    showPageButton: false,
    details: 'Browsing the web',
    state: 'Untitled Browser'
  },
  proxy: { enabled: false, mode: 'direct', host: '', port: '', username: '', password: '' },
  security: {
    httpsOnly: false,
    dns: { mode: 'automatic', servers: ['https://cloudflare-dns.com/dns-query'] },
    proxy: { enabled: false, mode: 'direct', scheme: 'http', host: '', port: '', username: '', password: '', domains: '', bypass: '' }
  },
  language: 'en',
  homeBackgroundPath: '',
  userAgent: { mode: 'default', custom: '' },
  shortcuts: {}
};

function ensureFiles() {
  fs.mkdirSync(USER_DATA(), { recursive: true });
  if (!fs.existsSync(CONFIG_FILE())) writeJson(CONFIG_FILE(), defaultConfig);
  if (!fs.existsSync(HISTORY_FILE())) writeJson(HISTORY_FILE(), []);
  if (!fs.existsSync(BOOKMARKS_FILE())) writeJson(BOOKMARKS_FILE(), []);
  if (!fs.existsSync(DOWNLOADS_FILE())) writeJson(DOWNLOADS_FILE(), []);
  if (!fs.existsSync(SESSION_FILE())) writeJson(SESSION_FILE(), []);
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
function loadState() {
  ensureFiles();
  const raw = readJson(CONFIG_FILE(), {});
  const legacyProxy = { ...defaultConfig.proxy, ...(raw.proxy || {}) };
  const securityProxy = { ...defaultConfig.security.proxy, ...(raw.security?.proxy || {}) };
  if (legacyProxy.enabled && !raw.security?.proxy) Object.assign(securityProxy, legacyProxy);
  config = {
    ...defaultConfig, ...raw,
    discord: { ...defaultConfig.discord, ...(raw.discord || {}) },
    proxy: legacyProxy,
    security: { ...defaultConfig.security, ...(raw.security || {}), dns: { ...defaultConfig.security.dns, ...(raw.security?.dns || {}) }, proxy: securityProxy },
    userAgent: { ...defaultConfig.userAgent, ...(raw.userAgent || {}) }
  };
  history = readJson(HISTORY_FILE(), []);
  bookmarks = readJson(BOOKMARKS_FILE(), []);
  downloads = readJson(DOWNLOADS_FILE(), []);
}
function homeBackgroundUrl() {
  try {
    if (!config.homeBackgroundPath || !fs.existsSync(config.homeBackgroundPath)) return '';
    return pathToFileURL(config.homeBackgroundPath).toString();
  } catch (_) { return ''; }
}
function publicConfig() {
  return { ...config, homeBackgroundUrl: homeBackgroundUrl(), homeBackgroundPath: config.homeBackgroundPath || '' };
}
function saveState() {
  writeJson(CONFIG_FILE(), config);
  writeJson(HISTORY_FILE(), history.slice(-5000));
  writeJson(BOOKMARKS_FILE(), bookmarks);
  writeJson(DOWNLOADS_FILE(), downloads.slice(0, 500));
}
function validHttpUrl(input) {
  try { const u = new URL(String(input)); return u.protocol === 'http:' || u.protocol === 'https:'; } catch (_) { return false; }
}
function isLoopbackHost(host) { return ['localhost','127.0.0.1','::1'].includes(String(host || '').toLowerCase()); }
function normalizeNetworkUrl(url) {
  const raw = String(url || '').trim();
  if (!config?.security?.httpsOnly) return raw;
  try {
    const u = new URL(raw);
    if (u.protocol === 'http:' && !isLoopbackHost(u.hostname)) u.protocol = 'https:';
    return u.toString();
  } catch (_) { return raw; }
}
function safeNavigationUrl(url, tab = null) {
  try {
    const u = new URL(String(url));
    if (u.protocol === 'https:') return true;
    if (u.protocol === 'http:') return !config?.security?.httpsOnly || isLoopbackHost(u.hostname);
    if (u.protocol === 'file:') return !!tab?.allowFileNavigation;
    return false;
  } catch (_) { return false; }
}
function sanitizeDownloadFilename(name) {
  const cleaned = String(name || 'download').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  return cleaned.slice(0, 180) || 'download';
}
function configureDnsResolver() {
  const dns = config?.security?.dns || defaultConfig.security.dns;
  const mode = ['automatic','secure','off'].includes(dns.mode) ? dns.mode : 'automatic';
  const servers = Array.isArray(dns.servers) ? dns.servers.filter(validDoHServer).slice(0,8) : [];
  try { app.configureHostResolver({ secureDnsMode: mode, secureDnsServers: servers }); } catch (error) { logger(`[Security] DNS config error: ${error.message}`); }
}
function validDoHServer(value) {
  try { const u = new URL(String(value).trim()); return u.protocol === 'https:' && /\/dns-query(?:$|\?)/i.test(u.pathname); } catch (_) { return false; }
}
function proxyEndpoint(proxy) {
  const scheme = ['http','https','socks4','socks5'].includes(proxy.scheme) ? proxy.scheme : 'http';
  const host = String(proxy.host || '').trim();
  const port = Number(proxy.port);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return `${scheme}://${host}:${port}`;
}
function splitDomains(proxy) {
  return String(proxy.domains || '').split(/[,\n;\s]+/).map(x => x.trim().toLowerCase()).filter(Boolean).slice(0,200);
}
function createProxyPac(proxy) {
  const endpoint = proxyEndpoint(proxy);
  if (!endpoint) throw new Error('Proxy host and port are required.');
  const parsed = new URL(endpoint);
  const pacDirective = parsed.protocol === 'socks5:' ? `SOCKS5 ${parsed.hostname}:${parsed.port}` : parsed.protocol === 'socks4:' ? `SOCKS ${parsed.hostname}:${parsed.port}` : parsed.protocol === 'https:' ? `HTTPS ${parsed.hostname}:${parsed.port}` : `PROXY ${parsed.hostname}:${parsed.port}`;
  const domains = splitDomains(proxy);
  if (!domains.length) throw new Error('Add at least one domain for split tunneling.');
  const clauses = domains.map(domain => {
    const safe = domain.replace(/[^a-z0-9.*_-]/gi,'').replace(/^\.+/,'');
    if (!safe) return '';
    if (safe.startsWith('*.')) return `shExpMatch(host, "${safe.replace(/"/g,'')}" )`;
    return `host === "${safe.replace(/"/g,'')}" || dnsDomainIs(host, ".${safe.replace(/"/g,'')}")`;
  }).filter(Boolean).join(' || ');
  const pac = `function FindProxyForURL(url, host) { if (${clauses}) return ${JSON.stringify(pacDirective)}; return "DIRECT"; }`;
  const pacPath = path.join(USER_DATA(), 'proxy-split.pac');
  fs.writeFileSync(pacPath, pac, 'utf8');
  return pathToFileURL(pacPath).toString();
}
async function applyProxySettings(sess) {
  if (!sess || typeof sess.setProxy !== 'function') return;
  const proxy = config?.security?.proxy || defaultConfig.security.proxy;
  if (!proxy.enabled || proxy.mode === 'direct') {
    await sess.setProxy({ mode: 'direct' });
  } else if (proxy.mode === 'split') {
    await sess.setProxy({ pacScript: createProxyPac(proxy) });
  } else {
    const endpoint = proxyEndpoint(proxy);
    if (!endpoint) throw new Error('Proxy host and port are required.');
    await sess.setProxy({ proxyRules: endpoint, proxyBypassRules: String(proxy.bypass || '').trim() });
  }
  if (typeof sess.closeAllConnections === 'function') await sess.closeAllConnections();
}
async function applyNetworkSecurity() {
  configureDnsResolver();
  const sessions = [session.defaultSession, ...tabs.map(t => t.view.webContents.session)];
  const unique = [...new Set(sessions)];
  for (const sess of unique) {
    try { await applyProxySettings(sess); } catch (error) { logger(`[Security] Proxy config error: ${error.message}`); }
  }
}
function setupSessionSecurity(sess) {
  if (!sess || sess.__untitledSecurityBound) return;
  sess.__untitledSecurityBound = true;
  sess.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  if (typeof sess.setPermissionCheckHandler === 'function') sess.setPermissionCheckHandler(() => false);
  setupDownloads(sess);
  applyProxySettings(sess).catch(error => logger(`[Security] Session proxy setup failed: ${error.message}`));
}
function isTrustedIpcSender(sender) {
  const allowed = [mainWindow?.webContents?.id, menuWindow?.webContents?.id].filter(Boolean);
  return allowed.includes(sender?.id);
}
function trustedHandle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedIpcSender(event.sender)) throw new Error('Unauthorized IPC sender');
    return handler(event, ...args);
  });
}
function handleShortcutInput(event, input) {
  if (!mainWindow || input.type !== 'keyDown') return;
  const mod = !!input.control || !!input.meta;
  const shift = !!input.shift;
  const alt = !!input.alt;
  const key = String(input.key || '').toLowerCase();
  const digit = /^[1-9]$/.test(key) ? Number(key) : 0;
  let handled = true;
  if (mod && !alt && key === 'l') sendShell('shortcut:focus-address');
  else if (mod && !alt && key === 't' && !shift) handleMenuAction('new-tab');
  else if (mod && !alt && key === 'w' && !shift) handleMenuAction('close-tab');
  else if (mod && !alt && shift && key === 't') { const last = closedTabs.pop(); if (last) createTab(last.url || config.homePage); }
  else if (mod && !alt && shift && key === 'n') handleMenuAction('incognito');
  else if (mod && !alt && key === 'tab') handleMenuAction(shift ? 'previous-tab' : 'next-tab');
  else if (mod && !alt && key === 'h') navigateInternal('history');
  else if (mod && !alt && key === 'j') navigateInternal('downloads');
  else if (mod && !alt && key === 'd') sendShell('shortcut:bookmark');
  else if (mod && !alt && key === 'p') handleMenuAction('print-page');
  else if (mod && !alt && key === 's' && !shift) handleMenuAction('save-page');
  else if (mod && !alt && shift && key === 'delete') clearCurrentSiteData(getTab());
  else if (mod && !alt && shift && key === 'i') handleMenuAction('devtools');
  else if (!mod && key === 'f12') handleMenuAction('devtools');
  else if (mod && !alt && key === 'r' && !shift) reloadActive(false);
  else if (mod && !alt && shift && key === 'r') reloadActive(true);
  else if (mod && !alt && key === '=') handleMenuAction('zoom-in');
  else if (mod && !alt && key === '-') handleMenuAction('zoom-out');
  else if (mod && !alt && key === '0') handleMenuAction('zoom-reset');
  else if (mod && !alt && shift && key === 's') screenshot(getTab());
  else if (mod && !alt && shift && key === 'm') handleMenuAction('mute');
  else if (mod && !alt && shift && key === 'b') navigateInternal('bookmarks');
  else if (mod && !alt && digit) setActiveTab(tabs[digit - 1]?.id);
  else if (alt && key === 'arrowleft') handleMenuAction('back');
  else if (alt && key === 'arrowright') handleMenuAction('forward');
  else handled = false;
  if (handled) event.preventDefault();
}

function normalizeAddress(input) {
  const raw = String(input || '').trim();
  if (!raw) return normalizeAddress(config.homePage);
  if (/^untitled:\/\//i.test(raw)) {
    const rest = raw.replace(/^untitled:\/\//i, '');
    const [route, q=''] = rest.split('?');
    return internalUrl(route || 'newtab', Object.fromEntries(new URLSearchParams(q)));
  }
  if (/^file:\/\//i.test(raw)) return raw;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(raw)) return raw;
  if (/^localhost(?::\d+)?(?:\/.*)?$/.test(raw) || /^127\.0\.0\.1(?::\d+)?(?:\/.*)?$/.test(raw)) return `http://${raw}`;
  if (raw.includes(' ') || !raw.includes('.')) return `${config.searchEngine}${encodeURIComponent(raw)}`;
  return normalizeNetworkUrl(`https://${raw}`);
}
function internalUrl(route, params = {}) {
  const safeRoute = String(route || 'newtab').replace(/[^a-z0-9_-]/gi, '') || 'newtab';
  const query = new URLSearchParams(params).toString();
  return `${INTERNAL_FILE_URL}#${safeRoute}${query ? `?${query}` : ''}`;
}
function isInternal(url) { return url.startsWith('untitled://') || url.startsWith('file://'); }
function parseInternalAddress(input) {
  const raw = String(input || '').trim();
  const match = raw.match(/^untitled:\/\/([^?#]+)(?:\?([^#]*))?$/i);
  if (!match) return null;
  const route = String(match[1] || 'newtab').toLowerCase();
  if (!INTERNAL_ROUTES.has(route)) return { route: 'newtab', params: {} };
  return { route, params: Object.fromEntries(new URLSearchParams(match[2] || '')) };
}
function internalDisplayUrl(route, params = {}) {
  const query = new URLSearchParams(params).toString();
  return `untitled://${route}${query ? `?${query}` : ''}`;
}

function displayUrl(url) {
  try {
    if (url.startsWith('file://') && url.includes('/src/renderer/internal.html#')) {
      const hash = decodeURIComponent(url.split('#')[1] || 'newtab');
      return `untitled://${hash}`;
    }
  } catch (_) {}
  return url;
}

function sendShell(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}
function getTab(id = activeTabId) { return tabs.find(t => t.id === id); }
function getTabState(tab) {
  if (!tab) return null;
  return { id: tab.id, url: tab.url || '', title: tab.title || '', incognito: !!tab.incognito, favicon: tab.favicon || '', loading: !!tab.loading, muted: !!tab.view.webContents.isAudioMuted(), canGoBack: tab.isInternal ? tab.internalHistory.length > 0 : !!tab.view.webContents.canGoBack(), canGoForward: tab.isInternal ? false : !!tab.view.webContents.canGoForward(), isError: !!tab.errorState, isInternal: !!tab.isInternal, internalRoute: tab.internalRoute || null };
}
function broadcastTabs() {
  sendShell('tabs:state', { tabs: tabs.map(getTabState), activeTabId });
}
function updateBounds() {
  if (!mainWindow) return;
  const [w, h] = mainWindow.getContentSize();
  for (const tab of tabs) {
    tab.view.setBounds({ x: 0, y: 112, width: w, height: Math.max(200, h - 112) });
    tab.view.setAutoResize({ width: true, height: true });
  }
}
function closeMenuWindow() {
  if (menuWindow && !menuWindow.isDestroyed()) menuWindow.hide();
}
function positionMenuWindow() {
  if (!mainWindow || !menuWindow || menuWindow.isDestroyed() || !menuWindow.isVisible()) return;
  const bounds = mainWindow.getContentBounds();
  const [mw, mh] = menuWindow.getSize();
  const display = screen.getDisplayNearestPoint({ x: bounds.x + bounds.width - 1, y: bounds.y + 1 });
  const area = display.workArea;
  let x = bounds.x + bounds.width - mw - 8;
  let y = bounds.y + 88;
  x = Math.max(area.x + 4, Math.min(x, area.x + area.width - mw - 4));
  if (y + mh > area.y + area.height - 4) y = Math.max(area.y + 4, area.y + area.height - mh - 4);
  menuWindow.setPosition(Math.round(x), Math.round(y), false);
}
function ensureMenuWindow() {
  if (menuWindow && !menuWindow.isDestroyed()) return menuWindow;
  menuWindow = new BrowserWindow({
    parent: mainWindow,
    modal: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: true,
    skipTaskbar: true,
    show: false,
    width: 316,
    height: 520,
    backgroundColor: '#121212',
    title: 'Untitled Browser Menu',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  menuWindow.loadFile(path.join(__dirname, '..', 'renderer', 'menu.html'));
  menuWindow.on('blur', () => closeMenuWindow());
  menuWindow.on('closed', () => { menuWindow = null; });
  return menuWindow;
}
function toggleMenuWindow() {
  const win = ensureMenuWindow();
  if (win.isVisible()) return closeMenuWindow();
  positionMenuWindow();
  win.show();
  win.focus();
}

function setActiveTab(id) {
  const tab = getTab(id);
  if (!tab) return;
  activeTabId = id;
  for (const t of tabs) {
    try { mainWindow.removeBrowserView(t.view); } catch (_) {}
  }
  if (tab.isInternal) {
    sendShell('internal:show', { route: tab.internalRoute || 'newtab', params: tab.internalParams || {} });
  } else {
    try { mainWindow.addBrowserView(tab.view); } catch (_) {}
    updateBounds();
    sendShell('internal:hide');
  }
  sendShell('tab:active', getTabState(tab));
  broadcastTabs();
  updateRPC(tab);
}
function loadInternalTab(tab, route, params = {}, { pushHistory = true } = {}) {
  if (!tab) return false;
  const safeRoute = INTERNAL_ROUTES.has(String(route).toLowerCase()) ? String(route).toLowerCase() : 'newtab';
  if (pushHistory && tab.url) {
    tab.internalHistory = Array.isArray(tab.internalHistory) ? tab.internalHistory : [];
    const prev = { url: tab.url, title: tab.title || '' };
    if (!tab.internalHistory.length || tab.internalHistory[tab.internalHistory.length - 1].url !== prev.url) tab.internalHistory.push(prev);
    tab.internalHistory = tab.internalHistory.slice(-50);
  }
  tab.isInternal = true;
  tab.internalRoute = safeRoute;
  tab.internalParams = { ...params };
  tab.errorState = safeRoute === 'error' ? tab.errorState : null;
  tab.url = internalDisplayUrl(safeRoute, params);
  tab.title = safeRoute === 'newtab' ? 'New Tab' : safeRoute === 'task-manager' ? 'Task Manager' : safeRoute.charAt(0).toUpperCase() + safeRoute.slice(1);
  if (tab.id === activeTabId) setActiveTab(tab.id); else broadcastTabs();
  return true;
}
function loadExternalTab(tab, url) {
  if (!tab) return false;
  tab.isInternal = false;
  tab.internalRoute = null;
  tab.internalParams = {};
  tab.errorState = null;
  url = normalizeNetworkUrl(url);
  if (!safeNavigationUrl(url, tab)) return false;
  tab.allowFileNavigation = /^file:/i.test(url);
  tab.url = url;
  tab.rpcStartTimestamp = Math.floor(Date.now() / 1000);
  tab.crashed = false;
  tab.view.webContents.loadURL(url).catch(() => {});
  if (tab.id === activeTabId) setActiveTab(tab.id); else broadcastTabs();
  return true;
}

function destroyTab(tab) {
  try { tab.view.webContents.destroy(); } catch (_) {}
  tabs = tabs.filter(t => t.id !== tab.id);
}
function maybeAddHistory(url, title) {
  if (!url || isInternal(url) || !/^https?:/i.test(url)) return;
  const entry = { url, title: title || url, time: new Date().toISOString() };
  history = history.filter(h => h.url !== url || (Date.now() - new Date(h.time).getTime()) > 3000);
  history.push(entry);
  history = history.slice(-5000);
  writeJson(HISTORY_FILE(), history);
  sendShell('history:changed', history.length);
}
function setupDownloads(sess) {
  if (sess.__untitledDownloadBound) return;
  sess.__untitledDownloadBound = true;
  sess.on('will-download', async (event, item) => {
    let target = config.downloadFolder || path.join(os.homedir(), 'Downloads');
    if (config.askDownloadLocation && mainWindow) {
      const result = await dialog.showSaveDialog(mainWindow, { defaultPath: path.join(target, item.getFilename()) });
      if (result.canceled) { item.cancel(); return; }
      target = path.dirname(result.filePath);
      item.setSavePath(result.filePath);
    } else {
      fs.mkdirSync(target, { recursive: true });
      item.setSavePath(path.join(target, sanitizeDownloadFilename(item.getFilename())));
    }
    const record = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, filename: item.getFilename(), url: item.getURL(), path: item.getSavePath(), state: 'progressing', received: 0, total: item.getTotalBytes(), start: new Date().toISOString() };
    downloads.unshift(record);
    sendShell('downloads:changed', downloads);
    item.on('updated', () => {
      record.received = item.getReceivedBytes(); record.total = item.getTotalBytes(); record.state = item.isPaused() ? 'paused' : 'progressing';
      sendShell('downloads:changed', downloads);
    });
    item.on('done', (_e, state) => { record.state = state; record.finished = new Date().toISOString(); downloads = downloads.slice(0, 500); writeJson(DOWNLOADS_FILE(), downloads); sendShell('downloads:changed', downloads); });
  });
}
let downloads = [];
let closedTabs = [];
function showErrorPage(tab, { code, message = '', targetUrl = tab?.url || '', returnUrl = '' } = {}) {
  if (!tab || !targetUrl) return;
  tab.errorState = {
    code: String(code || 'ERR_FAILED'),
    message: String(message || ''),
    targetUrl: String(targetUrl),
    returnUrl: String(returnUrl || tab.previousGoodUrl || config.homePage || internalUrl('newtab'))
  };
  tab.isInternal = true;
  tab.internalRoute = 'error';
  tab.internalParams = { code: tab.errorState.code, message: tab.errorState.message, url: tab.errorState.targetUrl };
  tab.url = internalDisplayUrl('error', tab.internalParams);
  tab.title = `${tab.errorState.code} — Untitled Browser`;
  if (tab.id === activeTabId) setActiveTab(tab.id); else broadcastTabs();
}
function checkResponseStatus(tab) {
  if (!tab || tab.loading || isInternal(tab.url)) return;
  const targetUrl = tab.url;
  tab.view.webContents.executeJavaScript(`(() => { try { const n = performance.getEntriesByType('navigation')[0]; return n && Number.isFinite(n.responseStatus) ? n.responseStatus : 200; } catch { return 200; } })()`, true)
    .then(status => {
      const numeric = Number(status);
      if ([400,401,402,403,404,405,408,409,410,429,500,501,502,503,504,505].includes(numeric)) {
        showErrorPage(tab, {
          code: numeric,
          targetUrl,
          returnUrl: tab.previousGoodUrl || config.homePage
        });
      }
    }).catch(() => {});
}
function bindTabEvents(tab) {
  const wc = tab.view.webContents;
  wc.on('before-input-event', (event, input) => handleShortcutInput(event, input));
  wc.setWindowOpenHandler(({ url }) => {
    if (!safeNavigationUrl(url, tab)) { logger(`[Security] Blocked new window: ${new URL(url).protocol}`); return { action: 'deny' }; }
    createTab(normalizeNetworkUrl(url), false, true);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (event, url) => {
    const safe = safeNavigationUrl(url, tab);
    if (!safe) { event.preventDefault(); logger(`[Security] Blocked navigation: ${String(url).slice(0,120)}`); }
  });
  wc.on('will-redirect', (event, url) => {
    const safe = safeNavigationUrl(url, tab);
    if (!safe) { event.preventDefault(); logger(`[Security] Blocked redirect: ${String(url).slice(0,120)}`); }
  });
  wc.on('page-favicon-updated', (_e, favicons) => {
    const candidate = (Array.isArray(favicons) ? favicons : []).find(icon => { try { const u = new URL(icon); return u.protocol === 'https:' || u.protocol === 'http:'; } catch (_) { return false; } });
    tab.favicon = candidate || '';
    broadcastTabs();
  });
  wc.on('page-title-updated', (_e, title) => { tab.title = title; if (tab.id === activeTabId) sendShell('tab:active', getTabState(tab)); broadcastTabs(); updateRPC(tab); });
  wc.on('did-start-loading', () => { tab.loading = true; broadcastTabs(); });
  wc.on('did-stop-loading', () => { tab.loading = false; checkResponseStatus(tab); broadcastTabs(); });
  wc.on('did-navigate', (_e, url) => {
    if (tab.isInternal) return;
    const displayed = displayUrl(url);
    if (/^https?:/i.test(displayed)) {
      if (!tab.errorState) {
        tab.previousGoodUrl = tab.lastGoodUrl || '';
        tab.lastGoodUrl = displayed;
      } else {
        tab.errorState = null;
        tab.previousGoodUrl = tab.lastGoodUrl || '';
        tab.lastGoodUrl = displayed;
      }
    }
    tab.url = displayed;
    tab.allowFileNavigation = false;
    tab.rpcStartTimestamp = Math.floor(Date.now() / 1000);
    maybeAddHistory(displayed, tab.title);
    sendShell('tab:active', getTabState(tab)); broadcastTabs(); updateRPC(tab);
  });
  wc.on('did-navigate-in-page', (_e, url) => { if (tab.isInternal) return; tab.url = displayUrl(url); tab.rpcStartTimestamp = tab.rpcStartTimestamp || Math.floor(Date.now() / 1000); sendShell('tab:active', getTabState(tab)); broadcastTabs(); updateRPC(tab); });
  wc.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 || !validatedURL) return;
    showErrorPage(tab, {
      code: `ERR_${Math.abs(errorCode)}`,
      message: errorDescription,
      targetUrl: validatedURL,
      returnUrl: tab.lastGoodUrl || config.homePage
    });
  });
  wc.on('render-process-gone', () => { tab.crashed = true; tab.title = 'Tab crashed'; broadcastTabs(); });
  wc.on('destroyed', () => { if (tabs.some(t => t.id === tab.id)) destroyTab(tab); if (activeTabId === tab.id) { activeTabId = tabs[0]?.id || null; if (activeTabId) setActiveTab(activeTabId); } broadcastTabs(); });
  setupDownloads(wc.session);
}
function createTab(inputUrl = config.homePage, incognito = false, background = false) {
  const id = nextTabId++;
  const partition = incognito ? `temp:untitled-incognito-${id}` : undefined;
  const view = new BrowserView({
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true
    }
  });
  const tab = { id, view, url: '', title: 'New Tab', incognito, loading: false, crashed: false, lastGoodUrl: '', previousGoodUrl: '', errorState: null, favicon: '', allowFileNavigation: false, isInternal: false, internalRoute: null, internalParams: {}, internalHistory: [], rpcStartTimestamp: Math.floor(Date.now() / 1000) };
  tabs.push(tab);
  const sess = view.webContents.session;
  setupSessionSecurity(sess);
  if (config.blockThirdPartyCookies) sess.setPartition ? null : null;
  bindTabEvents(tab);
  if (config.userAgent.mode === 'custom' && config.userAgent.custom) view.webContents.setUserAgent(config.userAgent.custom);
  const internal = parseInternalAddress(inputUrl);
  if (internal) {
    loadInternalTab(tab, internal.route, internal.params, { pushHistory: false });
  } else {
    const url = normalizeAddress(inputUrl);
    loadExternalTab(tab, url);
  }
  if (!background) setActiveTab(id); else broadcastTabs();
  return tab;
}
function closeTab(id) {
  const index = tabs.findIndex(t => t.id === id);
  if (index < 0) return;
  const wasActive = activeTabId === id;
  const tab = tabs[index];
  if (!tab.incognito && tab.url && !isInternal(tab.url)) closedTabs.push({ url: tab.url, title: tab.title });
  destroyTab(tab);
  if (!tabs.length) { createTab(config.homePage); return; }
  if (wasActive) setActiveTab(tabs[Math.min(index, tabs.length - 1)].id);
  else broadcastTabs();
}
function reloadActive(hard = false) {
  const tab = getTab(); if (!tab) return;
  hard ? tab.view.webContents.reloadIgnoringCache() : tab.view.webContents.reload();
}
function navigateActive(input) {
  const tab = getTab(); if (!tab) return false;
  const internal = parseInternalAddress(input);
  if (internal) return loadInternalTab(tab, internal.route, internal.params);
  return loadExternalTab(tab, normalizeAddress(input));
}

function navigateInternal(route, params = {}) {
  const tab = getTab();
  if (!tab) return false;
  closeMenuWindow();
  return loadInternalTab(tab, route, params);
}

function recoverError(action) {
  const tab = getTab();
  if (!tab?.errorState) return false;
  const state = { ...tab.errorState };
  if (action === 'retry') {
    tab.errorState = null;
    return loadExternalTab(tab, state.targetUrl);
  }
  if (action === 'back') {
    tab.errorState = null;
    const returnUrl = state.returnUrl || config.homePage;
    const internal = parseInternalAddress(returnUrl);
    if (internal) {
      tab.internalHistory = [];
      return loadInternalTab(tab, internal.route, internal.params, { pushHistory: false });
    }
    return loadExternalTab(tab, normalizeAddress(returnUrl));
  }
  if (action === 'new-tab') {
    createTab(config.homePage || 'untitled://newtab');
    return true;
  }
  return false;
}

function handleMenuAction(action) {
  closeMenuWindow();
  if (action === 'error-back' || action === 'error-retry' || action === 'error-new-tab') { return recoverError(action.replace('error-', '')); }
  const tab = getTab(); if (!tab) return;
  switch(action) {
    case 'back': { if (tab.isInternal) { const previous = tab.internalHistory.pop(); if (previous) { const internal = parseInternalAddress(previous.url); if (internal) loadInternalTab(tab, internal.route, internal.params, { pushHistory: false }); else loadExternalTab(tab, normalizeAddress(previous.url)); } } else if (tab.view.webContents.canGoBack()) tab.view.webContents.goBack(); break; }
    case 'forward': if (tab.view.webContents.canGoForward()) tab.view.webContents.goForward(); break;
    case 'reload': reloadActive(false); break;
    case 'hard-reload': reloadActive(true); break;
    case 'home': navigateActive(config.homePage); break;
    case 'new-tab': createTab(config.homePage); break;
    case 'new-window': createWindow(); break;
    case 'incognito': createTab(config.homePage, true); break;
    case 'close-tab': closeTab(activeTabId); break;
    case 'restore-closed': { const last = closedTabs.pop(); if (last) createTab(last.url || config.homePage); else sendShell('toast',{message:'No recently closed tabs.'}); break; }
    case 'duplicate-tab': createTab(tab.url || config.homePage, tab.incognito); break;
    case 'devtools': tab.view.webContents.openDevTools({ mode: 'detach' }); break;
    case 'zoom-in': tab.view.webContents.setZoomLevel(tab.view.webContents.getZoomLevel() + 1); break;
    case 'zoom-out': tab.view.webContents.setZoomLevel(tab.view.webContents.getZoomLevel() - 1); break;
    case 'zoom-reset': tab.view.webContents.setZoomLevel(0); break;
    case 'mute': tab.view.webContents.setAudioMuted(!tab.view.webContents.isAudioMuted()); broadcastTabs(); break;
    case 'pip': tab.view.webContents.executeJavaScript(`(() => { const vs=[...document.querySelectorAll('video')].sort((a,b)=>(b.clientWidth*b.clientHeight)-(a.clientWidth*a.clientHeight)); const v=vs[0]; if(!v) return 'NO_VIDEO'; if(!v.requestPictureInPicture) return 'UNSUPPORTED'; return v.requestPictureInPicture().then(()=> 'OK').catch(e => String(e && e.name || 'FAILED')); })()`, true).then(result=>sendShell('toast',{message:result==='OK'?'Picture-in-Picture opened.':'PiP is unavailable on this page.'})).catch(()=>sendShell('toast',{message:'PiP failed on this page.'})); break;
    case 'save-page': saveCurrentPage(tab); break;
    case 'print-page': printCurrentPage(tab); break;
    case 'clear-site-data': clearCurrentSiteData(tab); break;
    case 'copy-url': clipboard.writeText(String(tab.url || '')); sendShell('toast', { message: 'URL copied.' }); break;
    case 'fullscreen': mainWindow.setFullScreen(!mainWindow.isFullScreen()); break;
    case 'screenshot': screenshot(tab); break;
    case 'always-on-top': mainWindow.setAlwaysOnTop(!mainWindow.isAlwaysOnTop()); sendShell('toast', { message: mainWindow.isAlwaysOnTop() ? 'Always on top: ON' : 'Always on top: OFF' }); break;
    case 'next-tab': { const i = tabs.findIndex(t => t.id === activeTabId); setActiveTab(tabs[(i + 1) % tabs.length]?.id); break; }
    case 'previous-tab': { const i = tabs.findIndex(t => t.id === activeTabId); setActiveTab(tabs[(i - 1 + tabs.length) % tabs.length]?.id); break; }
    case 'close-window': mainWindow.close(); break;
  }
}
async function screenshot(tab) {
  try {
    const image = await tab.view.webContents.capturePage();
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: path.join(os.homedir(), 'Pictures', `UntitledBrowser-${Date.now()}.png`), filters: [{ name: 'PNG image', extensions: ['png'] }] });
    if (!result.canceled) { fs.mkdirSync(path.dirname(result.filePath), { recursive: true }); fs.writeFileSync(result.filePath, image.toPNG()); sendShell('toast', { message: `Screenshot saved: ${result.filePath}` }); }
  } catch (e) { sendShell('toast', { message: `Screenshot failed: ${e.message}` }); }
}
async function saveCurrentPage(tab) {
  if (!tab || tab.isInternal) return sendShell('toast', { message: 'There is no web page to save.' });
  try {
    const name = sanitizeDownloadFilename((tab.title || 'Untitled Browser page') + '.html');
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: path.join(config.downloadFolder || path.join(os.homedir(), 'Downloads'), name), filters: [{ name: 'HTML', extensions: ['html'] }] });
    if (result.canceled || !result.filePath) return;
    await tab.view.webContents.savePage(result.filePath, 'HTMLComplete');
    sendShell('toast', { message: 'Page saved.' });
  } catch (e) { sendShell('toast', { message: `Save page failed: ${e.message}` }); }
}
async function printCurrentPage(tab) {
  if (!tab || tab.isInternal) return sendShell('toast', { message: 'There is no web page to print.' });
  tab.view.webContents.print({ printBackground: true, silent: false }, success => sendShell('toast', { message: success ? 'Print dialog opened.' : 'Printing failed or canceled.' }));
}
async function clearCurrentSiteData(tab) {
  if (!tab || tab.isInternal) return sendShell('toast', { message: 'Open a website first.' });
  try { const origin = new URL(tab.url).origin; await tab.view.webContents.session.clearStorageData({ origin }); sendShell('toast', { message: `Site data cleared for ${origin}` }); }
  catch (e) { sendShell('toast', { message: `Could not clear site data: ${e.message}` }); }
}

function saveSession() {
  const urls = tabs
    .filter(t => !t.incognito && /^https?:/i.test(t.url || ''))
    .map(t => ({ url: t.url, title: t.title || '' }));
  writeJson(SESSION_FILE(), config.restoreSession ? urls.slice(-30) : []);
}

function createWindow() {
  mainWindow = new BrowserWindow({ frame: false, width: 1400, height: 900, minWidth: 900, minHeight: 600, title: APP_NAME, icon: path.join(app.getAppPath(), 'assets', 'icon.ico'), backgroundColor: '#0b0b0b', webPreferences: { preload: path.join(__dirname, '..', 'preload', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.webContents.on('before-input-event', (event, input) => handleShortcutInput(event, input));
  mainWindow.on('resize', () => { updateBounds(); positionMenuWindow(); });
  mainWindow.on('move', () => positionMenuWindow());
  mainWindow.on('close', () => closeMenuWindow());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.on('did-finish-load', () => {
    if (!tabs.length) {
      const saved = config.restoreSession ? readJson(SESSION_FILE(), []) : [];
      if (Array.isArray(saved) && saved.length) {
        saved.forEach((entry, index) => createTab(entry.url || config.homePage, false, index !== 0));
        setActiveTab(tabs[0]?.id);
      } else {
        createTab(config.homePage);
      }
    } else {
      setActiveTab(activeTabId || tabs[0]?.id);
    }
    sendShell('settings:state', publicConfig());
    sendShell('history:changed', history.length);
    sendShell('downloads:changed', downloads);
  });
  return mainWindow;
}
function clearBrowsingData(targetSession) {
  const ses = targetSession || session.defaultSession;
  return ses.clearStorageData({ storages: ['appcache','cookies','filesystem','indexdb','localstorage','shadercache','websql','serviceworkers','cachestorage'] }).then(() => ses.clearCache());
}
function logger(line) {
  try {
    const dir = USER_DATA();
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'browser.log'), `${new Date().toISOString()} ${line}\n`, 'utf8');
  } catch (_) {}
}

const { cleanRpcText, getRpcHost, getSearchQuery, pickRpcPhrase, formatMediaTime, buildDisplayTitle, isMediaHost } = require('./rpc-activity');

const SUGGESTION_ENDPOINTS = {
  'https://www.google.com/search?q=': q => `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&q=${encodeURIComponent(q)}`,
  'https://duckduckgo.com/?q=': q => `https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}`,
  'https://www.bing.com/search?q=': q => `https://www.bing.com/osjson.aspx?query=${encodeURIComponent(q)}`,
  'https://search.brave.com/search?q=': q => `https://search.brave.com/api/suggest?q=${encodeURIComponent(q)}`,
  'https://www.startpage.com/sp/search?query=': q => `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&q=${encodeURIComponent(q)}`
};

function parseSuggestionPayload(payload) {
  try {
    const data = JSON.parse(payload);
    if (Array.isArray(data)) {
      if (Array.isArray(data[1])) return data[1];
      return data.slice(1).filter(x => typeof x === 'string');
    }
    if (data && Array.isArray(data.suggestions)) {
      return data.suggestions.map(x => typeof x === 'string' ? x : x?.phrase || x?.text || '').filter(Boolean);
    }
  } catch (_) {}
  return [];
}

const SMART_SUGGESTION_SEEDS = [
  'роблокс', 'roblox', 'робзи', 'robzi', 'roblox studio', 'roblox games',
  'youtube', 'google', 'github', 'discord', 'twitch', 'spotify',
  'steam', 'reddit', 'wikipedia', 'chatgpt', 'minecraft', 'anime',
  'новости', 'погода', 'музыка', 'фильмы', 'игры', 'мемы', 'скачать',
  'как сделать', 'как настроить', 'что посмотреть'
];

function transliterateRu(value) {
  const map = {
    а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'yo', ж:'zh', з:'z', и:'i', й:'j',
    к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f',
    х:'h', ц:'c', ч:'ch', ш:'sh', щ:'shch', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya'
  };
  return String(value || '').toLocaleLowerCase('ru-RU').split('').map(ch => map[ch] ?? ch).join('');
}

function collectLocalSuggestions(q) {
  const query = q.toLocaleLowerCase();
  const translitQuery = transliterateRu(q);
  const candidates = [
    ...SMART_SUGGESTION_SEEDS,
    ...history.flatMap(h => [h?.title, h?.url]),
    ...bookmarks.flatMap(b => [b?.title, b?.url])
  ].map(String).map(x => x.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);

  const out = [];
  const seen = new Set();
  for (const item of candidates) {
    const low = item.toLocaleLowerCase();
    const tr = transliterateRu(item);
    const direct = low.startsWith(query);
    const crossScript = Boolean(translitQuery) && tr.startsWith(translitQuery);
    if (!direct && !crossScript) continue;
    const key = low;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ item, score: direct ? 0 : 1 });
  }
  out.sort((a, b) => a.score - b.score || a.item.length - b.item.length || a.item.localeCompare(b.item));
  return out.map(x => x.item);
}
function fetchSuggestionJson(url) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 UntitledBrowser/0.4.1', 'Accept': 'application/json' }
    }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { if (data.length < 256 * 1024) data += chunk; });
      res.on('end', () => resolve(res.statusCode >= 200 && res.statusCode < 300 ? data : ''));
    });
    req.setTimeout(1800, () => req.destroy());
    req.on('error', () => resolve(''));
  });
}
async function getSearchSuggestions(query, searchEngine) {
  const q = String(query || '').trim();
  if (!q || q.length > 128 || q.includes('://')) return [];
  const maker = SUGGESTION_ENDPOINTS[searchEngine] || SUGGESTION_ENDPOINTS['https://www.google.com/search?q='];
  const raw = await fetchSuggestionJson(maker(q));
  const normalized = parseSuggestionPayload(raw)
    .map(x => String(x).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const merged = [...collectLocalSuggestions(q), ...normalized];
  const lower = q.toLocaleLowerCase();
  const translitLower = transliterateRu(q);
  const unique = [];
  const seen = new Set();
  for (const item of merged) {
    const clean = String(item).trim();
    const key = clean.toLocaleLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    unique.push(clean);
  }
  unique.sort((a, b) => {
    const al = a.toLocaleLowerCase();
    const bl = b.toLocaleLowerCase();
    const ap = al.startsWith(lower) || (translitLower && transliterateRu(a).startsWith(translitLower)) ? 0 : 1;
    const bp = bl.startsWith(lower) || (translitLower && transliterateRu(b).startsWith(translitLower)) ? 0 : 1;
    return ap - bp || a.length - b.length;
  });
  return unique.slice(0, 8);
}


async function getRpcPageMetadata(tab) {
  if (!tab?.view?.webContents || tab.incognito || tab.isInternal || !/^https?:/i.test(tab.url || '')) return null;
  try {
    return await tab.view.webContents.executeJavaScript(`(() => {
      const clean = value => String(value || '').replace(/[\\u0000-\\u001f\\u007f]/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, 160);
      const media = [...document.querySelectorAll('video, audio')]
        .map(el => ({
          tag: el.tagName.toLowerCase(), paused: !!el.paused, duration: Number(el.duration), currentTime: Number(el.currentTime),
          ready: Number(el.readyState) >= 2, width: Number(el.videoWidth || 0), height: Number(el.videoHeight || 0),
          title: clean(el.getAttribute('aria-label') || el.getAttribute('title') || '')
        }))
        .sort((a,b) => (b.width*b.height) - (a.width*a.height));
      const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
      const h1 = document.querySelector('h1')?.textContent || '';
      const heading = document.querySelector('[data-testid="video-title"], h1.ytd-watch-metadata, h1.title')?.textContent || '';
      const bestVideo = media[0] || null;
      const pageTitle = clean(document.title);
      const mediaTitle = clean(heading || ogTitle || bestVideo?.title || '');
      return {
        pageTitle,
        mediaTitle,
        media: bestVideo ? {
          playing: !bestVideo.paused && bestVideo.ready,
          duration: bestVideo.duration,
          currentTime: bestVideo.currentTime,
          kind: bestVideo.tag === 'video' ? 'video' : 'audio'
        } : null
      };
    })()`, true);
  } catch (_) {
    return null;
  }
}

function rpcActivityForTab(tab = getTab(), pageMeta = null) {
  if (!tab) return null;
  if (tab.incognito) {
    return { type: 0, details: '🔒 Private browsing', state: 'Incognito • hidden', timestamps: { start: tab.rpcStartTimestamp || rpcStartTimestamp } };
  }
  if (tab.isInternal || isInternal(tab.url || '')) {
    const routeNames = {
      newtab: 'New Tab', history: 'History', downloads: 'Downloads', bookmarks: 'Bookmarks',
      extensions: 'Extensions', settings: 'Settings', security: 'Security', about: 'About', privacy: 'Privacy',
      performance: 'Performance', 'task-manager': 'Task Manager', shortcuts: 'Shortcuts', error: 'Error page'
    };
    return { type: 0, details: '🧭 Using Untitled Browser', state: routeNames[tab.internalRoute] || 'Internal page', timestamps: { start: tab.rpcStartTimestamp || rpcStartTimestamp } };
  }

  const host = getRpcHost(tab.url);
  const title = buildDisplayTitle(pageMeta?.mediaTitle || tab.title || 'Untitled page');
  const pageTitle = buildDisplayTitle(pageMeta?.pageTitle || tab.title || 'Untitled page');
  const searchQuery = config.discord.showSearch !== false ? getSearchQuery(tab.url) : '';
  const media = pageMeta?.media;
  const mediaHost = isMediaHost(host);
  let details;
  if (media && media.playing && title) {
    details = `▶️ ${title}`;
  } else if (mediaHost && title) {
    details = `👀 ${title}`;
  } else if (config.discord.showTitle !== false && pageTitle) {
    details = `📄 ${pageTitle}`;
  } else if (searchQuery) {
    details = `🔎 Ищет: ${searchQuery}`;
  } else {
    details = `😶 ${pickRpcPhrase(tab.id, host)}`;
  }

  if (searchQuery && !media?.playing && details.length < 95) {
    details = cleanRpcText(`${details} • 🔎 ${searchQuery}`);
  }

  const site = config.discord.showSite !== false && host ? `🌐 ${host}` : '🌐 Private';
  const typeLabel = media?.playing ? (media.kind === 'audio' ? '🎵 Listening' : '🎬 Watching') : '🌐 Browsing';
  const progress = media?.playing && Number.isFinite(media.currentTime) && Number.isFinite(media.duration) && media.duration > 0
    ? ` • ${formatMediaTime(media.currentTime)} / ${formatMediaTime(media.duration)}` : '';
  const state = cleanRpcText(`${typeLabel} • ${site}${progress}`, '🌐 Browsing');

  const activity = {
    type: media?.playing ? 3 : 0,
    details: cleanRpcText(details, 'Browsing the web'),
    state,
    timestamps: { start: tab.rpcStartTimestamp || rpcStartTimestamp }
  };
  activity.buttons = [{ label: 'GitHub Project', url: 'https://github.com/fattestbro/Untitled-Browser' }];
  return activity;
}

async function rpcActivityProvider(tab = getTab()) {
  if (!tab) return null;
  const pageMeta = await getRpcPageMetadata(tab);
  return rpcActivityForTab(tab, pageMeta);
}

function setupDiscordRpc() {
  rpcManager = new DiscordRpcManager({
    logger,
    activityProvider: () => rpcActivityProvider(getTab())
  });
  rpcManager.on('status', status => sendShell('discord:status', status));
}

function updateRPC() {
  if (!rpcManager) return;
  rpcManager.scheduleActivity();
}

async function chooseHomeBackground() {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png','jpg','jpeg','webp','gif'] }] });
  if (result.canceled || !result.filePaths[0]) return publicConfig();
  const source = result.filePaths[0];
  const ext = path.extname(source).toLowerCase();
  const allowed = new Set(['.png','.jpg','.jpeg','.webp','.gif']);
  if (!allowed.has(ext)) throw new Error('Unsupported image type.');
  const stat = fs.statSync(source);
  if (stat.size > 20 * 1024 * 1024) throw new Error('Background image is too large (max 20 MB).');
  const image = nativeImage.createFromPath(source);
  if (image.isEmpty()) throw new Error('Could not read the selected image.');
  const destination = path.join(USER_DATA(), `home-background${ext}`);
  fs.copyFileSync(source, destination);
  config.homeBackgroundPath = destination;
  writeJson(CONFIG_FILE(), config);
  sendShell('settings:state', publicConfig());
  return publicConfig();
}
async function chooseDownloadFolder() {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled || !result.filePaths[0]) return publicConfig();
  config.downloadFolder = path.resolve(result.filePaths[0]);
  fs.mkdirSync(config.downloadFolder, { recursive: true });
  writeJson(CONFIG_FILE(), config);
  sendShell('settings:state', publicConfig());
  return publicConfig();
}
async function clearHomeBackground() {
  if (config.homeBackgroundPath) { try { fs.unlinkSync(config.homeBackgroundPath); } catch (_) {} }
  config.homeBackgroundPath = '';
  writeJson(CONFIG_FILE(), config);
  sendShell('settings:state', publicConfig());
  return publicConfig();
}

function testRPC() {
  if (!rpcManager) setupDiscordRpc();
  return rpcManager.test();
}

app.on('login', (event, _webContents, _request, authInfo, callback) => {
  if (!authInfo?.isProxy) return;
  const proxy = config?.security?.proxy;
  const configuredPort = Number(proxy?.port);
  const hostMatches = String(authInfo.host || '').toLowerCase() === String(proxy?.host || '').trim().toLowerCase();
  const portMatches = !configuredPort || configuredPort === Number(authInfo.port);
  if (proxy?.enabled && proxy.username && hostMatches && portMatches) {
    event.preventDefault();
    callback(String(proxy.username), String(proxy.password || ''));
  }
});

app.setName(APP_NAME);
setupDiscordRpc();
if (process.platform === 'win32') app.setAppUserModelId('UntitledBrowser');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-background-media-suspend');
app.whenReady().then(async () => {
  loadState();
  if (!config.hardwareAcceleration) app.disableHardwareAcceleration();
  setupSessionSecurity(session.defaultSession);
  configureDnsResolver();
  await applyNetworkSecurity();
  createWindow();
  app.on('activate', () => { if (!mainWindow) createWindow(); });
  rpcManager.configure(config.discord);
});
app.on('window-all-closed', () => { rpcManager.shutdown(); saveState(); if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', async () => { rpcManager.shutdown(); saveSession(); saveState(); if (config.clearDataOnExit) await clearBrowsingData(); });

trustedHandle('tabs:create', (_e, { url, incognito = false } = {}) => ({ id: createTab(url || config.homePage, !!incognito).id }));
trustedHandle('tabs:close', (_e, id) => closeTab(Number(id)));
trustedHandle('tabs:activate', (_e, id) => setActiveTab(Number(id)));trustedHandle('tabs:navigate', (_e, input) => navigateActive(input));
trustedHandle('search:suggestions', async (_e, { query = '', searchEngine = config.searchEngine } = {}) => getSearchSuggestions(query, String(searchEngine || config.searchEngine)));
trustedHandle('tabs:internal', (_e, { route, params } = {}) => navigateInternal(route, params));
trustedHandle('menu:toggle', () => toggleMenuWindow());
trustedHandle('menu:close', () => closeMenuWindow());
trustedHandle('tabs:reload', (_e, hard = false) => reloadActive(!!hard));
trustedHandle('tabs:action', (_e, action) => handleMenuAction(action));
trustedHandle('tabs:duplicate', (_e, id) => { const t = getTab(Number(id)); if (t) createTab(t.url, t.incognito); });
trustedHandle('tabs:reorder', (_e, { from, to }) => { const a = tabs.findIndex(t=>t.id===Number(from)); const b = tabs.findIndex(t=>t.id===Number(to)); if(a>=0&&b>=0){ const [x]=tabs.splice(a,1); tabs.splice(b,0,x); broadcastTabs(); } });
trustedHandle('history:get', () => history.slice().reverse());
trustedHandle('history:delete', (_e, indices = []) => { const set = new Set(indices.map(Number)); history = history.filter((_, i) => !set.has(i)); writeJson(HISTORY_FILE(), history); sendShell('history:changed', history.length); return history.slice().reverse(); });
trustedHandle('history:clear', () => { history = []; writeJson(HISTORY_FILE(), history); sendShell('history:changed', 0); return true; });
trustedHandle('downloads:get', () => downloads);
trustedHandle('downloads:open', (_e, filePath) => { const found = downloads.find(d => d.path === path.resolve(String(filePath))); if (!found) throw new Error('Download path is not trusted.'); return shell.openPath(found.path); });
trustedHandle('downloads:show', (_e, filePath) => { const found = downloads.find(d => d.path === path.resolve(String(filePath))); if (!found) throw new Error('Download path is not trusted.'); return shell.showItemInFolder(found.path); });
trustedHandle('bookmarks:get', () => bookmarks);
trustedHandle('bookmarks:add', (_e, item) => { bookmarks.push({ id: Date.now(), title: item.title || item.url, url: item.url }); writeJson(BOOKMARKS_FILE(), bookmarks); sendShell('bookmarks:changed', bookmarks); return bookmarks; });
trustedHandle('bookmarks:delete', (_e, id) => { bookmarks = bookmarks.filter(b=>b.id!==Number(id)); writeJson(BOOKMARKS_FILE(), bookmarks); sendShell('bookmarks:changed', bookmarks); return bookmarks; });
trustedHandle('bookmarks:is', (_e, url) => bookmarks.some(b=>b.url===url));
trustedHandle('settings:get', () => publicConfig());
trustedHandle('settings:set', async (_e, next) => {
  config = { ...config, ...next, discord: { ...config.discord, ...(next.discord||{}), applicationId: FIXED_APPLICATION_ID }, proxy: { ...config.proxy, ...(next.proxy||{}) }, security: { ...config.security, ...(next.security||{}), dns: { ...config.security.dns, ...((next.security||{}).dns||{}) }, proxy: { ...config.security.proxy, ...((next.security||{}).proxy||{}) } }, userAgent: { ...config.userAgent, ...(next.userAgent||{}) } };
  writeJson(CONFIG_FILE(), config);
  try { await applyNetworkSecurity(); } catch (error) { logger(`[Security] apply failed: ${error.message}`); }
  sendShell('settings:state', publicConfig());
  rpcManager.configure(config.discord);
  return publicConfig();
});
trustedHandle('discord:status', () => rpcManager.getStatus());
trustedHandle('discord:test', () => testRPC());
trustedHandle('privacy:clear', (_e, data = {}) => clearBrowsingData(data.incognito ? getTab()?.view.webContents.session : session.defaultSession));
trustedHandle('screenshot:current', () => { const t=getTab(); if(t) return screenshot(t); });
trustedHandle('shell:openPath', (_e, p) => { const resolved = path.resolve(String(p)); const allowed = resolved.startsWith(path.resolve(USER_DATA()) + path.sep) || downloads.some(d => path.resolve(d.path || '') === resolved); if (!allowed) throw new Error('Path is not allowed.'); return shell.openPath(resolved); });
trustedHandle('shell:showInFolder', (_e, p) => { const resolved = path.resolve(String(p)); const allowed = downloads.some(d => path.resolve(d.path || '') === resolved); if (!allowed) throw new Error('Path is not allowed.'); return shell.showItemInFolder(resolved); });
trustedHandle('clipboard:writeText', (_e, value) => clipboard.writeText(String(value||'')));
trustedHandle('window:minimize', () => mainWindow?.minimize());
trustedHandle('window:maximize', () => { if (!mainWindow) return; mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); sendShell('window:maximized', mainWindow.isMaximized()); });
trustedHandle('window:close', () => mainWindow?.close());
trustedHandle('tabs:restore-closed', () => { const last = closedTabs.pop(); if (last) { createTab(last.url); return true; } return false; });
trustedHandle('session:save', () => { saveSession(); return true; });
trustedHandle('session:clear', () => { writeJson(SESSION_FILE(), []); return true; });
trustedHandle('app:paths', () => ({ userData: USER_DATA(), config: CONFIG_FILE(), downloads: config.downloadFolder, session: SESSION_FILE() }));
trustedHandle('app:metrics', () => app.getAppMetrics().map(m => ({ pid:m.pid, type:m.type, cpu:m.cpu, memory:m.memory, name:m.name })));
trustedHandle('extensions:list', () => session.defaultSession.getAllExtensions().map(e => ({ id:e.id, name:e.name, version:e.version, path:e.path, manifest:e.manifest }))); 
trustedHandle('extensions:load', async (_e, extensionPath) => { const resolved = path.resolve(String(extensionPath)); if (!fs.existsSync(resolved)) throw new Error('Extension folder does not exist.'); const loaded = await session.defaultSession.loadExtension(resolved, { allowFileAccess: false }); return { id:loaded.id, name:loaded.name, version:loaded.version, path:loaded.path }; });
trustedHandle('extensions:remove', (_e, id) => session.defaultSession.removeExtension(id));
trustedHandle('external:open', (_e, url) => { const value = String(url || ''); if (!validHttpUrl(value)) throw new Error('Only HTTP(S) external links are allowed.'); return shell.openExternal(value); });
trustedHandle('settings:choose-background', () => chooseHomeBackground());
trustedHandle('settings:clear-background', () => clearHomeBackground());
trustedHandle('settings:choose-download-folder', () => chooseDownloadFolder());
trustedHandle('security:apply', async () => { await applyNetworkSecurity(); return publicConfig().security; });
trustedHandle('security:restart-required', () => ({ reason: 'Some Chromium network settings may require restarting active connections.' }));
trustedHandle('browser:version', () => ({ app: app.getVersion(), electron: process.versions.electron, chromium: process.versions.chrome, node: process.versions.node }));
