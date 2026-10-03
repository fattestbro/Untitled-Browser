const INTERNAL_PREFIX = "untitled://";
function normalizeUrl(input, searchEngine = "https://www.google.com/search?q=") {
  const value = String(input ?? "").trim();
  if (!value) return "untitled://newtab";
  if (/^(https?|file|untitled):\/\//i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  if (/^localhost(?::\d+)?(?:[/?#].*)?$/i.test(value)) return "http://" + value;
  if (/^(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(value)) return "https://" + value;
  return searchEngine + encodeURIComponent(value);
}
function displayDomain(input) {
  try { const url = new URL(input); if (url.protocol === "untitled:") return "Untitled Browser"; if (url.protocol === "file:") return "Local file"; return url.hostname.replace(/^www\./i, "") || "Local page"; }
  catch { return "Untitled Browser"; }
}
function isInternalUrl(input) { return String(input ?? "").startsWith(INTERNAL_PREFIX); }
function safeExternalUrl(input) { try { const url = new URL(input); return url.protocol === "https:" || url.protocol === "http:" ? url.href : null; } catch { return null; } }
function buildActivity({url, title, incognito = false, showSite = true, showTitle = false}) {
  if (incognito) return {details:"Browsing privately",state:"Incognito"};
  if (isInternalUrl(url)) return {details:"Using Untitled Browser",state:"Browser"};
  const domain = displayDomain(url);
  const media = /youtube\.com|youtu\.be/i.test(url) ? "Watching YouTube" : "Browsing the web";
  return {details:showTitle && title ? String(title).slice(0,128) : media,state:showSite ? domain : "Private"};
}
module.exports={normalizeUrl,displayDomain,isInternalUrl,safeExternalUrl,buildActivity};
