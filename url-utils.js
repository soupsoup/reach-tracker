export function normalizeInput(input) {
  if (typeof input !== 'string' || input.length > 2048) throw new Error('Enter a valid public article URL.');
  let url;
  try { url = new URL(input.trim()); } catch { throw new Error('Enter a complete URL beginning with https:// or http://.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use a public HTTP or HTTPS URL without sign-in credentials.');
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host.includes(':') || /^[\d.]+$/.test(host) || /\.(localhost|local|internal)$/.test(host)) throw new Error('Use a public website URL.');
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
  return url.href;
}
export function articleKey(input) {
  try { const url = new URL(normalizeInput(input)); return url.hostname.replace(/^www\./, '') + url.pathname.replace(/\/$/, '') + url.search; } catch { return ''; }
}
export function shareUrl(origin,articleUrl) {
  const result=new URL('/',origin); result.searchParams.set('url',normalizeInput(articleUrl));return result.href;
}
