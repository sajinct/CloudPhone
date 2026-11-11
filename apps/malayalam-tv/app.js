import { loadPlaylist, playbackIssue, playbackMode } from './playlist.js';
import { unmuteVideo, enableNativeAudio, systemVolume } from './audio.js';

const $ = (id) => document.getElementById(id);
const browse = $('browse');
const watch = $('watch');
const list = $('channel-list');
const panel = $('panel');
const content = $('panel-content');
const center = $('soft-center');
let channels = [];
let visible = [];
let selected = 0;
let category = 'All channels';
let watching = false;
let loading = false;
let panelKind = '';
let resumeAfterPanel = false;
let video;
let hls;
let hlsPromise;
let generation = 0;
let state = 'loading';
let fullscreen = false;
let watchdog;
let refreshController;
let refreshGeneration = 0;
let storage;
let lastKey = '';
let favorites = new Set();
try {
  storage = localStorage;
  lastKey = storage.getItem('malayalam-tv-selected') || '';
  const saved = JSON.parse(storage.getItem('malayalam-tv-favorites') || '[]');
  if (Array.isArray(saved)) favorites = new Set(saved.filter((key) => typeof key === 'string').slice(0, 1000));
} catch { /* The app also works without storage. */ }

function save(key, value) {
  try { storage?.setItem(key, value); } catch { /* Optional preferences. */ }
}

function footer() {
  $('soft-left').textContent = panelKind ? 'Close' : 'Options';
  center.textContent = panelKind ? (panelKind === 'help' ? 'Done' : 'Select')
    : watching ? (state === 'error' ? 'Retry' : state === 'playing' ? 'Pause' : 'Play')
      : loading ? 'Wait' : visible.length ? 'Watch' : 'Reload';
  $('soft-right').textContent = panelKind || watching ? 'Back' : 'Exit';
}

function select(index, focus = true) {
  if (!visible.length) { $('channel-count').textContent = '0'; return; }
  selected = (index + visible.length) % visible.length;
  [...list.children].forEach((button, i) => {
    button.classList.toggle('selected', i === selected);
    button.tabIndex = i === selected ? 0 : -1;
  });
  $('channel-count').textContent = `${selected + 1} / ${visible.length}`;
  lastKey = visible[selected].key;
  save('malayalam-tv-selected', lastKey);
  if (focus && !watching && !panelKind) {
    list.children[selected].focus({ preventScroll: true });
    list.children[selected].scrollIntoView({ block: 'nearest' });
  }
}

function render() {
  visible = channels.filter((channel) => category === 'All channels' ||
    (category === 'Favorites' ? favorites.has(channel.key) : channel.groups.includes(category)));
  selected = Math.max(0, visible.findIndex((channel) => channel.key === lastKey));
  list.replaceChildren();
  for (const [index, channel] of visible.entries()) {
    const button = document.createElement('button');
    button.className = 'channel';
    button.setAttribute('aria-label', `${index + 1}. ${channel.name}${favorites.has(channel.key) ? ', favorite' : ''}`);
    const number = document.createElement('span');
    number.className = 'channel-number';
    number.textContent = index + 1;
    const copy = document.createElement('span');
    copy.className = 'channel-copy';
    const name = document.createElement('span');
    name.className = 'channel-name';
    name.textContent = channel.name;
    const meta = document.createElement('span');
    meta.className = 'channel-meta';
    const issue = channel.url.startsWith('http:') ? 'HTTP only' : new URL(channel.url).pathname.endsWith('.mpd') ? 'DASH' : channel.quality;
    meta.textContent = [channel.groups.join(' / '), issue, channel.partTime ? 'Part-time' : ''].filter(Boolean).join(' · ');
    copy.append(name, meta);
    const star = document.createElement('span');
    star.className = 'channel-star';
    star.textContent = favorites.has(channel.key) ? '★' : '›';
    star.setAttribute('aria-hidden', 'true');
    button.append(number, copy, star);
    button.addEventListener('focus', () => select(index, false));
    button.addEventListener('click', () => tune(index));
    list.append(button);
  }
  $('category-label').textContent = category;
  $('list-message').hidden = visible.length > 0;
  list.hidden = !visible.length;
  if (!visible.length && !loading) $('list-message').textContent = category === 'Favorites'
    ? 'No favorites yet. Choose All channels in Options, then press # on a channel to save it.'
    : 'No channels found. Press OK to refresh the playlist.';
  select(selected);
  footer();
}

async function refresh() {
  if (watching) goToChannels();
  else closePanel(false);
  refreshController?.abort();
  const token = ++refreshGeneration;
  const controller = new AbortController();
  refreshController = controller;
  const timeout = setTimeout(() => controller.abort(), 10000);
  loading = true;
  $('playlist-status').textContent = 'Refreshing playlist…';
  footer();
  try {
    const result = await loadPlaylist({ storage, signal: controller.signal });
    if (token !== refreshGeneration) return;
    channels = result.channels;
    $('playlist-status').textContent = result.source;
    loading = false;
    render();
  } catch (error) {
    if (token !== refreshGeneration) return;
    loading = false;
    $('playlist-status').textContent = 'Refresh failed · Options to retry';
    if (!channels.length) {
      $('list-message').textContent = error.message;
      $('list-message').hidden = false;
    }
    footer();
  } finally { clearTimeout(timeout); }
}

function playerStatus(message, nextState) {
  $('player-status').textContent = message;
  state = nextState;
  footer();
}

function stopPlayer() {
  generation++;
  clearTimeout(watchdog);
  if (hls) { hls.destroy(); hls = null; }
  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
    video = null;
  }
  $('video-stage').replaceChildren();
}

function timeoutPlayback(token) {
  clearTimeout(watchdog);
  watchdog = setTimeout(() => {
    if (token === generation && watching) fail('Stream not responding. Press OK to retry, or try another channel.');
  }, 25000);
}

function fail(message) {
  clearTimeout(watchdog);
  playerStatus(message, 'error');
  hls?.stopLoad();
  video?.pause();
}

async function play(token = generation) {
  const current = video;
  if (!current) return;
  unmuteVideo(current);
  enableNativeAudio(current);
  timeoutPlayback(token);
  try { await current.play(); }
  catch (error) {
    if (token !== generation) return;
    clearTimeout(watchdog);
    if (error.name === 'NotAllowedError') playerStatus('Press OK to start playback.', 'blocked');
    else if (error.name !== 'AbortError') fail('Cannot play this stream. It may be offline, restricted, or incompatible. Try another channel.');
  }
}

function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (hlsPromise) return hlsPromise;
  hlsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => failed(), 10000);
    function failed() { clearTimeout(timeout); script.remove(); reject(new Error('Cannot load video player.')); }
    script.src = new URL('./vendor/hls.min.js', import.meta.url).href;
    script.onload = () => { clearTimeout(timeout); window.Hls ? resolve(window.Hls) : failed(); };
    script.onerror = failed;
    document.head.append(script);
  }).catch((error) => { hlsPromise = null; throw error; });
  return hlsPromise;
}

async function tune(index) {
  if (loading || !visible.length) return;
  closePanel(false);
  stopPlayer();
  select(index, false);
  const channel = visible[selected];
  watching = true;
  browse.hidden = true;
  watch.hidden = false;
  $('watch-title').textContent = channel.name;
  $('watch-position').textContent = `${selected + 1} / ${visible.length}`;
  playerStatus('Connecting to live stream…', 'loading');
  center.focus();
  const issue = playbackIssue(channel, location.protocol);
  if (issue) { fail(issue); return; }
  const token = generation;
  const current = document.createElement('video');
  current.controls = true;
  configureVideoDisplay(current);
  unmuteVideo(current);
  current.preload = 'none';
  current.tabIndex = -1;
  current.setAttribute('aria-label', channel.name);
  video = current;
  $('video-stage').append(current);
  const active = () => token === generation && watching;
  current.addEventListener('loadedmetadata', () => {
    if (active()) { unmuteVideo(current); enableNativeAudio(current); }
  });
  current.audioTracks?.addEventListener?.('addtrack', () => { if (active()) enableNativeAudio(current); });
  current.addEventListener('playing', () => {
    if (!active()) return;
    clearTimeout(watchdog);
    if (panelKind) { resumeAfterPanel = true; current.pause(); return; }
    enableNativeAudio(current);
    playerStatus('← → channel · ↑ ↓ volume · * full screen', 'playing');
  });
  current.addEventListener('pause', () => {
    if (active() && state !== 'error') { clearTimeout(watchdog); playerStatus('Paused · press OK to play', 'paused'); }
  });
  current.addEventListener('waiting', () => {
    if (active() && state !== 'error') { playerStatus('Buffering…', 'buffering'); timeoutPlayback(token); }
  });
  current.addEventListener('ended', () => { if (active()) fail('This broadcast has ended. Retry or choose another channel.'); });
  current.addEventListener('error', () => {
    if (active()) fail('Stream unavailable. It may be offline, region restricted, or incompatible. Try another channel.');
  });
  timeoutPlayback(token);
  try {
    if (playbackMode(current, navigator.userAgent) === 'native') {
      current.src = channel.url;
      current.load();
      play(token);
    } else {
      const Hls = await loadHls();
      if (!active()) return;
      if (!Hls.isSupported()) { fail('This browser cannot play HLS streams. Open this app in CloudPhone or an HLS-capable browser.'); return; }
      hls = new Hls({ capLevelToPlayerSize: true, startLevel: 0, maxBufferLength: 15, backBufferLength: 10 });
      hls.on(Hls.Events.MEDIA_ATTACHED, () => { if (active()) hls.loadSource(channel.url); });
      hls.on(Hls.Events.MANIFEST_PARSED, () => { if (active()) play(token); });
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        if (!active()) return;
        const index = hls.audioTracks.findIndex((track) => /^(?:ml|mal)$/i.test(track.lang || '') || /malayalam/i.test(track.name));
        if (index >= 0) hls.audioTrack = index;
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (active() && data.fatal) fail('Stream unavailable. The broadcaster may be offline or blocking browser playback. Try another channel.');
      });
      hls.attachMedia(current);
    }
  } catch {
    if (active()) fail('Unable to start the video player. Check your connection and retry.');
  }
}

function togglePlayback() {
  if (state === 'error') tune(selected);
  else if (video) { if (!video.paused) video.pause(); else play(); }
}

function goToChannels() {
  closePanel(false);
  setFullscreen(false, false);
  stopPlayer();
  watching = false;
  watch.hidden = true;
  browse.hidden = false;
  render();
  footer();
}

function changeVolume(direction) {
  if (direction >= 0) { unmuteVideo(video); enableNativeAudio(video); }
  if (systemVolume(navigator.volumeManager, direction)) return;
  if (!video) return;
  if (direction) {
    video.volume = Math.min(1, Math.max(0, Math.round((video.volume + direction * 0.1) * 10) / 10));
    if (video.volume) video.muted = false;
    $('player-status').textContent = `Volume ${Math.round(video.volume * 100)}% · ↑ ↓ to adjust`;
  } else $('player-status').textContent = 'Press ↑ ↓ to adjust volume.';
}

function soundOn() {
  if (!video) return;
  closePanel(false);
  unmuteVideo(video);
  enableNativeAudio(video);
  // This explicit action also brings a phone at system volume zero up one step.
  systemVolume(navigator.volumeManager, 1);
  if (video.paused && state !== 'error') play();
  $('player-status').textContent = 'Sound enabled · press ↑ to raise phone volume';
}

function configureVideoDisplay(current) {
  const phoneFullscreen = fullscreen && /Cloud Phone/i.test(navigator.userAgent);
  current.playsInline = !phoneFullscreen;
  current.toggleAttribute('x-puffin-playsinline', !phoneFullscreen);
}

function setFullscreen(enabled, resume = true) {
  fullscreen = Boolean(enabled && watching);
  $('app').classList.toggle('fullscreen', fullscreen);
  $('fullscreen-back').hidden = !fullscreen;
  if (!video) return;
  const phone = /Cloud Phone/i.test(navigator.userAgent);
  const wasPlaying = !video.paused || resumeAfterPanel;
  // Cloud Phone does not support the browser Fullscreen API. Removing its
  // inline opt-out lets the phone use its native fullscreen video display.
  if (phone && wasPlaying) video.pause();
  configureVideoDisplay(video);
  if (phone && resume && wasPlaying) play();
  if (fullscreen) video.focus({ preventScroll: true });
  else center.focus();
}

function toggleFullscreen() {
  if (!watching || !video) return;
  closePanel();
  setFullscreen(!fullscreen);
}

function toggleFavorite() {
  const channel = visible[selected];
  if (!channel) return;
  if (favorites.has(channel.key)) favorites.delete(channel.key);
  else favorites.add(channel.key);
  save('malayalam-tv-favorites', JSON.stringify([...favorites]));
  if (!watching) render();
}

function chooseCategory(value) {
  goToChannels();
  category = value;
  render();
}

function showPanel(kind) {
  if (!panelKind) {
    resumeAfterPanel = watching && video && !video.paused;
    if (resumeAfterPanel) video.pause();
  }
  panelKind = kind;
  panel.hidden = false;
  browse.hidden = true;
  watch.hidden = true;
  content.replaceChildren();
  $('panel-title').textContent = kind === 'categories' ? 'Categories' : kind === 'help' ? 'How to watch' : 'Options';
  if (kind === 'help') {
    const help = document.createElement('div');
    help.className = 'help';
    help.tabIndex = 0;
    help.innerHTML = '<p><b>Choose a channel</b><br>↑ ↓ browse · OK watch<br>1–9: first nine in this list<br>#: add / remove favorite</p><p><b>While watching</b><br>OK play / pause · ← → channel<br>↑ ↓ volume · 0 sound / volume<br>*: full screen on / off<br>Back: exit full screen, then channels</p><p><b>No sound?</b><br>Choose Enable sound, then press ↑ to raise phone volume. Full screen uses the phone video player.</p><p>Left soft key (Escape): options. Filter by category or Favorites. Refresh playlist to get the latest entries.</p><p>Streams come from <a href="https://iptv-org.github.io/iptv/languages/mal.m3u">IPTV-org</a>. Availability depends on the broadcaster and your region. HTTP-only and DASH entries cannot play in this app. Some channels require headers a browser cannot supply.</p>';
    content.append(help);
    help.focus();
  } else {
    const actions = kind === 'categories' ? [
      ['All channels', () => chooseCategory('All channels')],
      ['Favorites', () => chooseCategory('Favorites')],
      ...[...new Set(channels.flatMap((channel) => channel.groups))].sort().map((group) => [group, () => chooseCategory(group)])
    ] : [
      ...(watching ? [
        [fullscreen ? 'Exit full screen' : 'Full screen', toggleFullscreen],
        ['Enable sound', soundOn],
        ['Volume', () => { closePanel(); changeVolume(0); }],
        ['Retry stream', () => tune(selected)]
      ] : []),
      ['Categories', () => showPanel('categories')],
      ['Favorites', () => chooseCategory('Favorites')],
      ...(visible.length ? [[favorites.has(visible[selected].key) ? 'Remove favorite' : 'Add favorite', () => { closePanel(); toggleFavorite(); }]] : []),
      ...(watching ? [['All channels', () => chooseCategory('All channels')]] : []),
      ['Refresh playlist', refresh],
      ['How to watch', () => showPanel('help')]
    ];
    for (const [label, action] of actions) {
      const button = document.createElement('button');
      button.className = 'panel-item';
      button.textContent = label;
      button.addEventListener('click', action);
      content.append(button);
    }
    content.firstElementChild.focus();
  }
  footer();
}

function closePanel(resume = true) {
  if (!panelKind) return;
  panelKind = '';
  panel.hidden = true;
  browse.hidden = watching;
  watch.hidden = !watching;
  if (watching) {
    center.focus();
    if (resume && resumeAfterPanel && state !== 'error') play();
  } else if (visible.length) select(selected);
  else center.focus();
  resumeAfterPanel = false;
  footer();
}

function back() {
  if (panelKind) { closePanel(); return true; }
  if (fullscreen) { setFullscreen(false); return true; }
  if (watching) { goToChannels(); return true; }
  return false;
}

function primary() {
  if (panelKind === 'help') closePanel();
  else if (panelKind) (document.activeElement.matches('.panel-item') ? document.activeElement : content.firstElementChild)?.click();
  else if (watching) togglePlayback();
  else if (!loading) { if (visible.length) tune(selected); else refresh(); }
}

function movePanel(direction) {
  const buttons = [...content.querySelectorAll('.panel-item')];
  if (!buttons.length) return;
  const index = buttons.indexOf(document.activeElement);
  const next = buttons[(index + direction + buttons.length) % buttons.length];
  next.focus();
  next.scrollIntoView({ block: 'nearest' });
}

$('soft-left').addEventListener('click', () => panelKind ? closePanel() : showPanel('options'));
center.addEventListener('click', primary);
$('soft-right').addEventListener('click', () => { if (!back()) window.close(); });
$('sound-on').addEventListener('click', soundOn);
$('fullscreen-on').addEventListener('click', toggleFullscreen);
$('fullscreen-back').addEventListener('click', () => setFullscreen(false));
window.addEventListener('back', (event) => { if (back()) event.preventDefault(); });
window.addEventListener('pagehide', stopPlayer);
window.addEventListener('pageshow', (event) => { if (event.persisted) goToChannels(); });
window.addEventListener('resize', () => { if (!watching && !panelKind) list.children[selected]?.scrollIntoView({ block: 'nearest' }); });

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  const key = event.key;
  if (key === 'Escape' || key === 'SoftLeft') {
    event.preventDefault();
    if (!event.repeat) panelKind ? closePanel() : showPanel('options');
  } else if (['Backspace', 'BrowserBack', 'SoftRight'].includes(key)) {
    if (back()) event.preventDefault();
  } else if (key === 'Enter') {
    if (document.activeElement?.matches('a')) return;
    event.preventDefault();
    if (!event.repeat) {
      if (document.activeElement?.matches('#soft-left, #soft-right, .watch-action, .fullscreen-back')) document.activeElement.click();
      else primary();
    }
  } else if (panelKind) {
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      event.preventDefault();
      if (panelKind === 'help') content.scrollBy(0, key === 'ArrowUp' ? -35 : 35);
      else movePanel(key === 'ArrowUp' ? -1 : 1);
    } else if (key === 'Tab' && panelKind !== 'help') { event.preventDefault(); movePanel(event.shiftKey ? -1 : 1); }
  } else if (watching && (key === '*' || key.toLowerCase() === 'f')) {
    event.preventDefault();
    if (!event.repeat) toggleFullscreen();
  } else if (/^[1-9]$/.test(key)) {
    event.preventDefault();
    if (!event.repeat && Number(key) <= visible.length) tune(Number(key) - 1);
  } else if (key === '#') {
    event.preventDefault();
    if (!event.repeat) toggleFavorite();
  } else if (!watching && (key === 'ArrowUp' || key === 'ArrowDown')) {
    event.preventDefault();
    select(selected + (key === 'ArrowUp' ? -1 : 1));
  } else if (watching && (key === 'ArrowLeft' || key === 'ArrowRight')) {
    event.preventDefault();
    if (!event.repeat) tune(selected + (key === 'ArrowLeft' ? -1 : 1));
  } else if (watching && (key === 'ArrowUp' || key === 'ArrowDown' || key === '0')) {
    event.preventDefault();
    changeVolume(key === 'ArrowUp' ? 1 : key === 'ArrowDown' ? -1 : 0);
  }
});

refresh();
