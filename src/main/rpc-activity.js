'use strict';

const RPC_GENERIC_PHRASES = [
  'делает вид, что работает', 'проводит важнейшее интернет-исследование', 'опять открыл ещё одну вкладку',
  'ищет смысл жизни в поисковой строке', 'занят очень серьёзными делами', 'ушёл на минутку и пропал в интернете',
  'проверяет абсолютно важную информацию', 'профессионально тратит время', 'делает вид, что это по делу',
  'копает глубже, чем надо', 'исследует интернет вместо работы', 'пытается не открывать новую вкладку',
  'нашёл что-то подозрительно интересное', 'чинит то, что вчера работало', 'просто смотрит. пока что.',
  'проводит цифровую археологию', 'куда-то зашёл и уже не знает зачем', 'очень занят интернетом',
  'делает серьёзное лицо перед экраном', 'ещё пять минут и точно закончит'
];
const RPC_HOST_PHRASES = {
  'youtube.com': ['смотрит ещё одно видео', 'зашёл на пять минут', 'попал в бесконечную ленту'],
  'google.com': ['гуглит очевидное', 'ищет то, что уже искал вчера', 'проверяет ещё один результат'],
  'bing.com': ['проверяет альтернативную реальность', 'ищет ответ без лишнего пафоса'],
  'duckduckgo.com': ['ищет без лишних глаз', 'проверяет утку'],
  'github.com': ['чинит код, который сам сломал', 'делает вид, что понимает git', 'ищет баг среди багов'],
  'reddit.com': ['провалился в комментарии', 'читает то, что не собирался читать'],
  'twitch.tv': ['смотрит, как кто-то играет вместо него', 'залип в трансляцию'],
  'spotify.com': ['листает музыку до бесконечности', 'ищет трек, который уже знает'],
  'discord.com': ['проверяет Discord, находясь в Discord', 'ещё раз смотрит уведомления'],
  'steamcommunity.com': ['проверяет профиль вместо работы', 'опять смотрит инвентарь'],
  'wikipedia.org': ['начал с одного факта и заблудился', 'читает статью длиной с жизнь']
};
const RPC_SEARCH_KEYS = ['q', 'query', 'search_query', 'text', 'term', 'keyword', 'search'];

const RPC_MEDIA_HOSTS = new Set([
  'youtube.com', 'youtu.be', 'twitch.tv', 'spotify.com', 'soundcloud.com', 'vimeo.com',
  'netflix.com', 'crunchyroll.com', 'primevideo.com', 'tiktok.com', 'instagram.com'
]);

function cleanRpcText(value, fallback = '') {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || fallback;
}
function getRpcHost(url) {
  try {
    const parsed = new URL(String(url || ''));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.hostname.replace(/^www\./i, '').toLowerCase();
  } catch (_) { return ''; }
}
function getSearchQuery(url) {
  const host = getRpcHost(url);
  if (!host) return '';
  const knownSearchHosts = ['google.com','bing.com','duckduckgo.com','search.brave.com','startpage.com','youtube.com','yandex.ru','yahoo.com','ecosia.org'];
  if (!knownSearchHosts.some(domain => host === domain || host.endsWith(`.${domain}`))) return '';
  try {
    const parsed = new URL(url);
    for (const key of RPC_SEARCH_KEYS) {
      const value = parsed.searchParams.get(key);
      if (value && value.trim()) return cleanRpcText(value, '');
    }
  } catch (_) {}
  return '';
}
function pickRpcPhrase(tabId, host, now = Date.now()) {
  const pool = RPC_HOST_PHRASES[host] || RPC_GENERIC_PHRASES;
  const seed = Math.floor(now / 30000) + Number(tabId || 0);
  return pool[Math.abs(seed) % pool.length];
}

function formatMediaTime(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return '';
  const total = Math.floor(n);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

function buildDisplayTitle(title, fallback = 'Untitled page') {
  let value = cleanRpcText(title, fallback);
  value = value.replace(/\s*[|–—-]\s*(YouTube|Twitch|Spotify|Netflix|Crunchyroll|Vimeo)\s*$/i, '');
  return cleanRpcText(value, fallback);
}

function isMediaHost(host) {
  return RPC_MEDIA_HOSTS.has(host) || [...RPC_MEDIA_HOSTS].some(domain => host.endsWith(`.${domain}`));
}

module.exports = { RPC_GENERIC_PHRASES, RPC_HOST_PHRASES, cleanRpcText, getRpcHost, getSearchQuery, pickRpcPhrase, formatMediaTime, buildDisplayTitle, isMediaHost };
