import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseM3U, loadPlaylist, PLAYLIST_URL, playbackIssue, playbackMode } from '../apps/malayalam-tv/playlist.js';

const fixture = `\uFEFF#EXTM3U\r
#EXTINF:-1 tvg-id="one" tvg-logo="https://example.com/a,b.png" group-title="News;General",First, TV (720p) [Not 24/7]
#EXTVLCOPT:http-user-agent=Custom Player
https://example.com/one.m3u8?token=a,b
#EXTINF:-1 group-title="Music",Second
relative/live.m3u8
#EXTINF:-1,Duplicate
https://example.com/one.m3u8?token=a,b
#EXTINF:-1,Unsafe
javascript:alert(1)
#EXTINF:-1,Invalid
https://user:password@example.com/private
#EXTINF:-1,Protected
#KODIPROP:inputstream.adaptive.license_type=com.widevine.alpha
https://example.com/protected.mpd
`;

test('M3U preserves names, quoted commas, metadata and relative URLs, without duplicate or unsafe sources', () => {
  const channels = parseM3U(fixture, 'https://example.org/feed/list.m3u');
  assert.equal(channels.length, 3);
  assert.equal(channels[0].name, 'First, TV');
  assert.equal(channels[0].quality, '720p');
  assert.equal(channels[0].partTime, true);
  assert.equal(channels[0].needsHeaders, true);
  assert.deepEqual(channels[0].groups, ['News', 'General']);
  assert.equal(channels[1].url, 'https://example.org/feed/relative/live.m3u8');
  assert.equal(channels[2].drm, true);
});

test('malformed and empty playlists are rejected', () => {
  for (const value of ['<html>Unavailable</html>', '#EXTM3U\n#EXTINF:-1,No stream', '', null, 'a'.repeat(2_000_001)]) {
    assert.throws(() => parseM3U(value));
  }
});

test('bundled snapshot includes the supplied Malayalam TV feed', async () => {
  const channels = parseM3U(await readFile(new URL('../apps/malayalam-tv/playlist.m3u', import.meta.url), 'utf8'));
  assert.ok(channels.length >= 50);
  assert.ok(channels.some((channel) => channel.name === 'Asianet HD'));
  assert.ok(channels.some((channel) => channel.name === 'Big TV 24x7'));
  assert.ok(channels.some((channel) => channel.groups.includes('News')));
  assert.equal(new Set(channels.map((channel) => channel.url)).size, channels.length);
});

test('unsupported HTTP, DASH and protected sources receive specific explanations', () => {
  assert.match(playbackIssue({ url: 'http://example.org/live.m3u8' }, 'https:'), /HTTP/);
  assert.match(playbackIssue({ url: 'https://example.org/live.mpd' }, 'https:'), /DASH/);
  assert.match(playbackIssue({ url: 'https://example.org/live.m3u8', drm: true }, 'https:'), /protected/);
  assert.equal(playbackIssue({ url: 'https://example.org/live.m3u8' }, 'https:'), '');
  assert.equal(playbackIssue({ url: 'http://example.org/live.m3u8' }, 'http:'), '');
});

test('Cloud Phone chooses native HLS even if Chromium does not advertise its remote decoder', () => {
  assert.equal(playbackMode({ canPlayType: () => '' }, 'Cloud Phone; Nokia 3210'), 'native');
  assert.equal(playbackMode({ canPlayType: () => 'maybe' }, 'Safari'), 'native');
  assert.equal(playbackMode({ canPlayType: () => '' }, 'Chrome'), 'hls');
  assert.equal(playbackMode({ canPlayType: () => 'maybe' }, 'Chrome Safari', true), 'hls');
  assert.equal(playbackMode({ canPlayType: () => 'maybe' }, 'Other browser', false), 'native');
});

test('a valid live playlist is cached; a broken refresh falls back to that cache', async () => {
  const cache = new Map();
  const storage = { getItem: (key) => cache.get(key), setItem: (key, value) => cache.set(key, value) };
  const live = await loadPlaylist({ storage, fetcher: async () => new Response(fixture) });
  assert.equal(live.source, 'Live playlist');
  const cached = await loadPlaylist({ storage, fetcher: async () => { throw new Error('Offline'); } });
  assert.match(cached.source, /Saved/);
  assert.deepEqual(cached.channels, live.channels);
});

test('invalid remote and cached data fall back to the bundled copy without overwriting the cache', async () => {
  const calls = [];
  const result = await loadPlaylist({
    storage: { getItem: () => '<html>Error</html>', setItem: () => assert.fail('Invalid remote data must not be cached') },
    fetcher: async (url) => {
      calls.push(String(url));
      return new Response(String(url) === PLAYLIST_URL ? '<html>Failure</html>' : fixture);
    }
  });
  assert.match(result.source, /Bundled/);
  assert.equal(calls.length, 2);
});

test('live playlist works when storage is unavailable, and total failure remains retryable', async () => {
  assert.equal((await loadPlaylist({ storage: { setItem() { throw new Error('Denied'); } }, fetcher: async () => new Response(fixture) })).channels.length, 3);
  await assert.rejects(loadPlaylist({ fetcher: async () => new Response('', { status: 503 }) }));
});
