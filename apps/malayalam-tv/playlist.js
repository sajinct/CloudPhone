export const PLAYLIST_URL = 'https://iptv-org.github.io/iptv/languages/mal.m3u';

function metadata(line) {
  let quoted = false;
  let comma = -1;
  for (let index = 0; index < line.length; index++) {
    if (line[index] === '"') quoted = !quoted;
    if (line[index] === ',' && !quoted) { comma = index; break; }
  }
  if (comma < 0) return null;
  const attributes = {};
  const prefix = line.slice(0, comma);
  for (const match of prefix.matchAll(/([\w-]+)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g)) {
    attributes[match[1]] = match[2] ?? match[3] ?? match[4];
  }
  const rawName = line.slice(comma + 1).trim();
  if (!rawName) return null;
  return {
    id: attributes['tvg-id'] || '',
    name: rawName.replace(/\s*\(\d+[pi]\)/gi, '').replace(/\s*\[Not 24\/7\]/gi, '').trim(),
    rawName,
    quality: /\((\d+[pi])\)/i.exec(rawName)?.[1] || '',
    groups: (attributes['group-title'] || 'General').split(';').map((group) => group.trim()).filter(Boolean),
    partTime: /\[Not 24\/7\]/i.test(rawName),
    needsHeaders: Boolean(attributes['http-user-agent'] || attributes['http-referrer']),
    drm: false
  };
}

export function parseM3U(text, base = PLAYLIST_URL) {
  if (typeof text !== 'string' || text.length > 2_000_000) throw new Error('Playlist is too large or invalid.');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim());
  if (!lines.find((line) => line)?.startsWith('#EXTM3U')) throw new Error('This is not an M3U playlist.');
  const seen = new Set();
  const channels = [];
  let pending = null;
  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) pending = metadata(line);
    else if (line.startsWith('#EXTVLCOPT:') && pending) {
      if (/http-(?:user-agent|referrer)=/i.test(line)) pending.needsHeaders = true;
    } else if (line.startsWith('#KODIPROP:') && pending) {
      if (/license_(?:type|key)=/i.test(line)) pending.drm = true;
    } else if (line && !line.startsWith('#')) {
      if (!pending) continue;
      try {
        const url = new URL(line, base);
        if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !seen.has(url.href)) {
          const channel = { ...pending, url: url.href, key: pending.id || pending.name };
          channels.push(channel);
          seen.add(url.href);
        }
      } catch { /* Skip malformed stream addresses. */ }
      pending = null;
    }
  }
  if (!channels.length) throw new Error('No TV channels were found in the playlist.');
  return channels;
}

export function playbackIssue(channel, protocol) {
  if (channel.drm) return 'This channel requires a protected player and cannot play here.';
  if (new URL(channel.url).pathname.toLowerCase().endsWith('.mpd')) {
    return 'This channel uses DASH, which this CloudPhone app does not support. Choose another channel.';
  }
  if (protocol === 'https:' && channel.url.startsWith('http:')) {
    return 'This playlist entry uses HTTP and cannot play inside this HTTPS app. Choose another channel.';
  }
  return '';
}

export function playbackMode(video, userAgent, hasMediaSource = typeof globalThis.MediaSource !== 'undefined') {
  const native = Boolean(video.canPlayType('application/vnd.apple.mpegurl'));
  const safari = /Safari/i.test(userAgent) && !/Chrome|Chromium|Edg/i.test(userAgent);
  // Chromium may advertise HLS without a working native demuxer. Prefer the
  // MSE player there; Cloud Phone has its own server-side native HLS decoder.
  return /Cloud Phone/i.test(userAgent) || (native && (safari || !hasMediaSource)) ? 'native' : 'hls';
}

// Try the live feed, then a previous successful fetch, then the shipped copy.
// Only parsed channel lists can be returned or written into the cache.
export async function loadPlaylist({ fetcher = fetch, storage, signal } = {}) {
  try {
    const response = await fetcher(PLAYLIST_URL, { cache: 'no-store', signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const channels = parseM3U(text);
    try { storage?.setItem('malayalam-tv-playlist', text); } catch { /* Optional cache. */ }
    return { channels, source: 'Live playlist' };
  } catch {
    try {
      const cached = storage?.getItem('malayalam-tv-playlist');
      if (cached) return { channels: parseM3U(cached), source: 'Saved playlist · refresh to update' };
    } catch { /* Ignore missing, blocked or malformed cache entries. */ }
    const response = await fetcher(new URL('./playlist.m3u', import.meta.url));
    if (!response.ok) throw new Error('Cannot load channels. Check your connection and retry.');
    return { channels: parseM3U(await response.text()), source: 'Bundled playlist · refresh to update' };
  }
}
