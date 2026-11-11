import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openBrowser } from './helpers/browser.mjs';

const snapshot = await readFile('apps/malayalam-tv/playlist.m3u', 'utf8');
const fixture = `#EXTM3U
#EXTINF:-1 tvg-id="one" group-title="News",One TV (720p)
https://stream.example/one.m3u8
#EXTINF:-1 tvg-id="two" group-title="Music",Two TV (576p)
https://stream.example/two.m3u8
#EXTINF:-1 tvg-id="three" group-title="News",Three TV (1080p)
https://stream.example/three.m3u8
#EXTINF:-1 tvg-id="dash" group-title="General",DASH TV
https://stream.example/live.mpd
#EXTINF:-1 tvg-id="http" group-title="General",HTTP TV
http://stream.example/live.m3u8
`;

const nativeMock = `
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Cloud Phone; Nokia 3210' });
  window.__playError = '';
  window.__feed = ${JSON.stringify(fixture)};
  window.__failFeed = false;
  const realFetch = window.fetch;
  window.fetch = (url, options) => String(url).includes('iptv-org.github.io/iptv/languages/mal.m3u')
    ? window.__failFeed ? Promise.reject(new Error('Network error')) : Promise.resolve(new Response(window.__feed))
    : realFetch(url, options);
  const proto = HTMLMediaElement.prototype;
  proto.canPlayType = () => 'probably';
  Object.defineProperty(proto, 'paused', { configurable: true, get() { return !this.__playing; } });
  proto.play = function() {
    if (window.__playError) { const name = window.__playError; window.__playError = ''; return Promise.reject(new DOMException('Blocked', name)); }
    this.__playing = true;
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  };
  proto.pause = function() { if (this.__playing) { this.__playing = false; this.dispatchEvent(new Event('pause')); } };
  proto.load = function() { this.__loads = (this.__loads || 0) + 1; };
`;

const session = await openBrowser();
const { cdp, evaluate, key, until, viewport, screenshot } = session;
try {
  await cdp('Network.setBlockedURLs', { urls: ['*stream.example*'] });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: nativeMock });
  await viewport(240, 320);
  await cdp('Page.navigate', { url: 'http://127.0.0.1:13211/malayalam-tv/' });
  await until('document.querySelectorAll(".channel").length === 5');
  assert.equal(await evaluate('document.querySelectorAll("video").length'), 0);
  await key('#');
  assert.equal(await evaluate('document.querySelector(".channel-star").textContent'), '★');

  await key('Escape');
  await key('Enter');
  assert.equal(await evaluate('document.getElementById("panel-title").textContent'), 'Categories');
  await key('ArrowDown');
  await key('ArrowDown');
  await key('ArrowDown');
  await key('ArrowDown');
  assert.equal(await evaluate('document.activeElement.textContent'), 'News');
  await key('Enter');
  assert.equal(await evaluate('document.querySelectorAll(".channel").length'), 2);
  await key('Enter');
  await until('document.getElementById("soft-center").textContent === "Pause"');
  assert.equal(await evaluate('document.querySelector("video").hasAttribute("x-puffin-playsinline")'), false);
  assert.equal(await evaluate('document.getElementById("app").classList.contains("fullscreen")'), true, 'Phone starts in its audible native fullscreen player');
  assert.equal(await evaluate('document.querySelector("video").muted'), false);
  assert.equal(await evaluate('document.querySelector("script[src*=hls]")'), null, 'Native playback never loads HLS.js');
  await key('Enter');
  assert.equal(await evaluate('document.getElementById("soft-center").textContent'), 'Play');
  await key('Enter');
  await evaluate('window.__oldVideo = document.querySelector("video")');
  await key('ArrowRight');
  await until('document.getElementById("watch-title").textContent === "Three TV"');
  assert.equal(await evaluate('__oldVideo.hasAttribute("src")'), false, 'Switching releases previous stream');
  await key('ArrowRight');
  assert.equal(await evaluate('document.getElementById("watch-title").textContent'), 'One TV', 'Channel switching wraps inside category');

  await evaluate('document.querySelector("video").volume = 0.5');
  await key('ArrowUp');
  assert.equal(await evaluate('document.querySelector("video").volume'), 0.6);
  await evaluate('window.__volume = []; Object.defineProperty(navigator, "volumeManager", {value: {requestUp(){__volume.push("up")},requestDown(){__volume.push("down")},requestShow(){__volume.push("show")}}})');
  await key('ArrowDown');
  await key('0');
  assert.deepEqual(await evaluate('__volume'), ['down', 'show']);
  await evaluate('document.querySelector("video").muted = true; document.querySelector("video").volume = 0;');
  await evaluate('document.getElementById("sound-on").click()');
  assert.equal(await evaluate('document.querySelector("video").muted'), false, 'Enable sound unmutes the phone video');
  assert.equal(await evaluate('document.querySelector("video").volume'), 1);
  assert.equal(await evaluate('__volume.at(-1)'), 'up', 'Enable sound raises phone system volume');
  await key('*');
  assert.equal(await evaluate('document.getElementById("app").classList.contains("fullscreen")'), false);
  assert.equal(await evaluate('document.querySelector("video").paused'), true, 'Leaving fullscreen on the phone pauses playback');
  assert.equal(await evaluate('document.querySelector("video").hasAttribute("x-puffin-playsinline")'), false, 'Phone must never opt into silent inline playback');
  await key('*');
  assert.equal(await evaluate('document.getElementById("app").classList.contains("fullscreen")'), true);
  assert.equal(await evaluate('document.querySelector("video").hasAttribute("x-puffin-playsinline")'), false, 'Phone fullscreen opts into native video display');
  assert.equal(await evaluate('document.querySelector("video").playsInline'), false);
  assert.equal(await evaluate('document.querySelector("video").paused'), false);
  assert.equal(await evaluate('document.querySelector("video").getBoundingClientRect().height'), 320);
  await screenshot('malayalam-tv-fullscreen-240x320.png');
  assert.equal(await evaluate('!window.dispatchEvent(new Event("back", {cancelable:true}))'), true);
  assert.equal(await evaluate('document.getElementById("app").classList.contains("fullscreen")'), false);
  assert.equal(await evaluate('document.getElementById("watch").hidden'), false, 'First Back only exits fullscreen');
  assert.equal(await evaluate('document.querySelector("video").hasAttribute("x-puffin-playsinline")'), false);
  assert.equal(await evaluate('document.querySelector("video").paused'), true);
  await key('Escape');
  assert.equal(await evaluate('document.activeElement.textContent'), 'Full screen');
  await key('Enter');
  assert.equal(await evaluate('document.getElementById("app").classList.contains("fullscreen")'), true, 'Menu offers fullscreen');
  await key('*');
  assert.equal(await evaluate('document.getElementById("app").classList.contains("fullscreen")'), false);
  await key('Escape');
  assert.equal(await evaluate('document.querySelector("video").paused'), true);
  await key('Escape');
  assert.equal(await evaluate('document.querySelector("video").paused'), true, 'Closing a menu preserves the paused app view');
  await key('Enter');
  assert.equal(await evaluate('document.getElementById("app").classList.contains("fullscreen")'), true);
  await key('Escape');
  await key('Escape');
  assert.equal(await evaluate('document.querySelector("video").paused'), false);

  await evaluate('document.querySelector("video").dispatchEvent(new Event("error"))');
  assert.equal(await evaluate('document.getElementById("soft-center").textContent'), 'Retry');
  await key('Enter');
  await until('document.getElementById("soft-center").textContent === "Pause"');
  await evaluate('window.__playError = "NotAllowedError"');
  await key('ArrowRight');
  await until('document.getElementById("player-status").textContent.includes("Press OK")');
  await key('Enter');
  await until('document.getElementById("soft-center").textContent === "Pause"');

  assert.equal(await evaluate('!window.dispatchEvent(new Event("back", {cancelable:true}))'), true);
  assert.equal(await evaluate('document.querySelector("video").paused'), true, 'Back from native playback returns a paused view');
  assert.equal(await evaluate('!window.dispatchEvent(new Event("back", {cancelable:true}))'), true);
  assert.equal(await evaluate('document.querySelectorAll("video").length'), 0);
  assert.equal(await evaluate('window.dispatchEvent(new Event("back", {cancelable:true}))'), true);
  await key('Escape');
  await key('ArrowDown');
  await key('Enter');
  assert.equal(await evaluate('document.getElementById("category-label").textContent'), 'Favorites');
  assert.equal(await evaluate('document.querySelectorAll(".channel").length'), 1);
  await key('#');
  assert.equal(await evaluate('document.getElementById("list-message").hidden'), false);
  assert.match(await evaluate('document.getElementById("list-message").textContent'), /No favorites/);

  // Return to all channels; DASH must fail clearly without creating a player.
  await key('Escape');
  await key('Enter');
  await key('Enter');
  await key('4');
  assert.match(await evaluate('document.getElementById("player-status").textContent'), /DASH/);
  assert.equal(await evaluate('document.querySelectorAll("video").length'), 0);
  await key('Backspace');

  // Live refresh failure uses a valid saved playlist.
  await evaluate('window.__failFeed = true');
  await key('Escape');
  await key('ArrowDown');
  await key('ArrowDown');
  await key('ArrowDown');
  await key('Enter');
  await until('document.getElementById("playlist-status").textContent.includes("Saved")');
  // A corrupt cache uses the local bundled feed instead.
  await evaluate('localStorage.setItem("malayalam-tv-playlist", "broken")');
  await key('Escape');
  await key('ArrowDown');
  await key('ArrowDown');
  await key('ArrowDown');
  await key('Enter');
  await until('document.getElementById("playlist-status").textContent.includes("Bundled")');
  assert.equal(await evaluate('document.querySelectorAll(".channel").length'), 64);

  for (const [width, height] of [[240, 320], [128, 160], [240, 240], [320, 240], [800, 700]]) {
    await viewport(width, height);
    await screenshot(`malayalam-tv-${width}x${height}.png`);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    assert.ok(await evaluate('document.querySelector(".softkeys").getBoundingClientRect().bottom') <= height);
    await key('1');
    await until('document.getElementById("soft-center").textContent === "Pause"');
    if (width === 240 && height === 320) await screenshot('malayalam-tv-player-240x320.png');
    await key('Backspace');
    await key('Backspace');
  }

  // Use a mock MSE player to verify the desktop branch and cleanup independently.
  await evaluate(`Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Chrome' }); window.__failFeed = false; window.__feed = ${JSON.stringify(fixture)}; HTMLMediaElement.prototype.canPlayType = () => ''; window.Hls = class {
    static isSupported() { return true; }
    static Events = {MEDIA_ATTACHED:'attached',MANIFEST_PARSED:'manifest',AUDIO_TRACKS_UPDATED:'audio',ERROR:'error'};
    constructor() { this.callbacks = {}; this.audioTracks = [{lang:'hin'}, {lang:'mal'}]; window.__hls = this; }
    on(name, callback) { this.callbacks[name] = callback; }
    attachMedia(video) { this.video = video; this.callbacks.attached(); }
    loadSource(url) { this.url = url; this.callbacks.manifest(); this.callbacks.audio(); }
    stopLoad() { this.stopped = true; }
    destroy() { this.dead = true; }
  }`);
  await key('1');
  await until('Boolean(window.__hls?.url)');
  assert.equal(await evaluate('document.querySelector("video").hasAttribute("x-puffin-playsinline")'), true, 'Desktop playback stays embedded');
  assert.equal(await evaluate('document.getElementById("app").classList.contains("fullscreen")'), false);
  assert.equal(await evaluate('__hls.audioTrack'), 1, 'Malayalam audio is selected');
  await evaluate('__hls.callbacks.error(null, {fatal:true})');
  assert.equal(await evaluate('document.getElementById("soft-center").textContent'), 'Retry');
  await key('Backspace');
  assert.equal(await evaluate('__hls.dead'), true);
  assert.equal(session.exceptions.length, 0, JSON.stringify(session.exceptions));
  console.log('Malayalam TV browser checks passed: native/HLS playback, sound recovery, fullscreen, categories, favorites, volume, errors, autoplay, cache fallback, and five screen sizes.');
} finally { await session.close(); }
