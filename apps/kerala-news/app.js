import { CHANNELS, sourceUrls } from './channels.js';

const $ = (id) => document.getElementById(id);
const listView = $('channels-view');
const watchView = $('watch-view');
const list = $('channel-list');
const panel = $('panel');
const panelContent = $('panel-content');
const center = $('soft-center');
let selected = 0;
let watching = false;
let panelKind = '';
let resumeAfterPanel = false;
let player = null;
let ready = false;
let state = 'loading';
let generation = 0;
let watchdog;
let apiPromise;

try {
  const saved = Number(localStorage.getItem('kerala-news-channel'));
  if (Number.isInteger(saved) && saved >= 0 && saved < CHANNELS.length) selected = saved;
} catch { /* Storage can be disabled on shared devices. */ }

CHANNELS.forEach((channel, index) => {
  const button = document.createElement('button');
  button.className = 'channel';
  button.setAttribute('aria-label', `${index + 1}. ${channel.name}, watch on YouTube`);
  const number = document.createElement('span');
  number.className = 'channel-number';
  number.textContent = index + 1;
  const name = document.createElement('span');
  name.className = 'channel-name';
  name.textContent = channel.name;
  const arrow = document.createElement('span');
  arrow.className = 'channel-arrow';
  arrow.textContent = '›';
  arrow.setAttribute('aria-hidden', 'true');
  button.append(number, name, arrow);
  button.addEventListener('focus', () => select(index, false));
  button.addEventListener('click', () => tune(index));
  list.append(button);
});

function select(index, focus = true) {
  selected = (index + CHANNELS.length) % CHANNELS.length;
  [...list.children].forEach((button, i) => {
    button.classList.toggle('selected', i === selected);
    button.tabIndex = i === selected ? 0 : -1;
  });
  $('channel-count').textContent = `${selected + 1} / ${CHANNELS.length}`;
  if (focus) {
    list.children[selected].focus({ preventScroll: true });
    list.children[selected].scrollIntoView({ block: 'nearest' });
  }
  try { localStorage.setItem('kerala-news-channel', String(selected)); } catch { /* Optional. */ }
}

function footer() {
  $('soft-left').textContent = panelKind ? 'Close' : 'Options';
  center.textContent = panelKind ? (panelKind === 'help' ? 'Done' : 'Select')
    : !watching ? 'Watch' : state === 'error' ? 'Retry' : state === 'playing' ? 'Pause' : 'Play';
  $('soft-right').textContent = panelKind || watching ? 'Back' : 'Exit';
}

function status(message, nextState, fallback = false) {
  $('status').textContent = message;
  state = nextState;
  $('youtube-link').hidden = !fallback;
  footer();
}

function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    const timeout = setTimeout(() => fail(), 15000);
    function fail() {
      clearTimeout(timeout);
      script.remove();
      reject(new Error('YouTube did not load'));
    }
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timeout);
      resolve();
    };
    script.onerror = fail;
    document.head.append(script);
  }).catch((error) => {
    apiPromise = null;
    throw error;
  });
  return apiPromise;
}

function dispose() {
  generation++;
  clearTimeout(watchdog);
  ready = false;
  if (player) {
    try { player.destroy(); } catch { /* Removing the iframe below also stops playback. */ }
    player = null;
  }
  $('player-container').replaceChildren();
}

function waitForPlayback(token) {
  clearTimeout(watchdog);
  watchdog = setTimeout(() => {
    if (token === generation && watching) {
      status('Stream not responding. Retry or open in YouTube.', 'error', true);
    }
  }, 25000);
}

async function tune(index) {
  if (panelKind) closePanel(false);
  dispose();
  select(index, false);
  watching = true;
  listView.hidden = true;
  watchView.hidden = false;
  $('heading').textContent = CHANNELS[selected].name;
  $('edition').textContent = 'TV';
  center.focus();
  const token = generation;
  status('Connecting to YouTube…', 'loading');

  // YouTube requires an actual viewport of at least 200 × 200; do not shrink
  // or crop its player on QQVGA devices. Offer the YouTube page instead.
  const compact = document.documentElement.clientWidth < 200 || document.documentElement.clientHeight < 285;
  watchView.classList.toggle('compact', compact);
  if (compact) {
    status('This screen is too small for the embedded player. Open in YouTube.', 'error', true);
    return;
  }
  if (!/^https?:$/.test(location.protocol)) {
    status('Open this app through a web server, then retry.', 'error', true);
    return;
  }
  waitForPlayback(token);
  try {
    const urls = sourceUrls(CHANNELS[selected].id, location.origin);
    await loadYouTube();
    if (token !== generation || !watching) return;
    const frame = document.createElement('iframe');
    frame.id = `youtube-player-${token}`;
    frame.title = `${CHANNELS[selected].name} on YouTube`;
    frame.src = urls.embed;
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.tabIndex = -1;
    $('player-container').append(frame);
    const current = () => token === generation && watching;
    player = new window.YT.Player(frame.id, {
      events: {
        onReady(event) {
          if (!current()) return;
          ready = true;
          if (panelKind) resumeAfterPanel = true;
          else event.target.playVideo();
        },
        onStateChange(event) {
          if (!current()) return;
          if (event.data === 1) {
            clearTimeout(watchdog);
            status('Watching · ← → channel · ↑ ↓ volume', 'playing');
            if (panelKind) {
              resumeAfterPanel = true;
              event.target.pauseVideo();
            }
          } else if (event.data === 2) {
            clearTimeout(watchdog);
            status('Paused · press OK to play', 'paused');
          } else if (event.data === 0) {
            clearTimeout(watchdog);
            status('This broadcast has ended. Retry or choose another channel.', 'error', true);
          } else if (event.data === 3) {
            status('Buffering…', 'buffering');
            waitForPlayback(token);
          } else if (event.data === 5 || event.data === -1) {
            status('Ready · press OK if playback does not start', 'ready');
          }
        },
        onAutoplayBlocked() {
          if (!current()) return;
          clearTimeout(watchdog);
          status('Press OK to start playback', 'blocked');
        },
        onError(event) {
          if (!current()) return;
          clearTimeout(watchdog);
          const messages = {
            2: 'The stream link is invalid.',
            5: 'YouTube could not play this stream.',
            100: 'This stream is unavailable or has been replaced.',
            101: 'This channel does not allow embedded playback.',
            150: 'This channel does not allow embedded playback.',
            153: 'YouTube could not verify this app. Check HTTPS hosting and referrer settings.'
          };
          status(`${messages[event.data] || 'Unable to play this stream.'} Open in YouTube or try another channel.`, 'error', true);
        }
      }
    });
  } catch {
    if (token !== generation || !watching) return;
    clearTimeout(watchdog);
    status('Cannot connect to YouTube. Check your connection and retry.', 'error', true);
  }
}

function togglePlayback() {
  if (state === 'error') return tune(selected);
  if (!ready || !player) return;
  if (state === 'playing') player.pauseVideo();
  else {
    player.playVideo();
    waitForPlayback(generation);
  }
}

function goToChannels() {
  closePanel(false);
  dispose();
  watching = false;
  watchView.hidden = true;
  listView.hidden = false;
  $('heading').textContent = 'Kerala News';
  footer();
  select(selected);
}

function openYouTube() {
  const url = sourceUrls(CHANNELS[selected].id, location.origin).watch;
  // Same-tab navigation works on keypad phones and permits the right soft key
  // to return to our channel list. Stop our player before leaving.
  dispose();
  location.assign(url);
}

function changeVolume(direction) {
  const manager = navigator.volumeManager;
  if (manager) {
    const action = direction > 0 ? 'requestUp' : direction < 0 ? 'requestDown' : 'requestShow';
    if (typeof manager[action] === 'function') { manager[action](); return; }
  }
  if (ready && player && direction && typeof player.setVolume === 'function') {
    const volume = Math.min(100, Math.max(0, player.getVolume() + direction * 10));
    if (volume) player.unMute();
    player.setVolume(volume);
    $('status').textContent = `Volume ${volume}% · ↑ ↓ to adjust`;
  } else {
    $('status').textContent = 'Use ↑ ↓ during playback to adjust volume.';
  }
}

function showPanel(kind) {
  if (!panelKind) {
    resumeAfterPanel = watching && state === 'playing';
    if (resumeAfterPanel && ready) player.pauseVideo();
  }
  panelKind = kind;
  panel.hidden = false;
  listView.hidden = true;
  watchView.hidden = true;
  $('panel-title').textContent = kind === 'help' ? 'How to watch' : 'Options';
  panelContent.replaceChildren();
  if (kind === 'help') {
    const text = document.createElement('div');
    text.className = 'help-text';
    text.tabIndex = 0;
    text.innerHTML = '<p><strong>Choose</strong><br>↑ ↓ browse · OK watch<br>1–9 open a channel</p><p><strong>While watching</strong><br>OK play / pause<br>← → previous / next<br>↑ ↓ volume · 0 volume menu</p><p><strong>Soft keys</strong><br>Left: options (Escape)<br>Right: back / exit</p><p>Streams are provided by YouTube and may end or be unavailable. Use Options → Open in YouTube if a stream cannot play here.</p>';
    panelContent.append(text);
    text.focus();
  } else {
    const actions = watching ? [
      ['Volume', () => { closePanel(); changeVolume(0); }],
      ['Retry stream', () => tune(selected)],
      ['Open in YouTube ↗', openYouTube],
      ['All channels', goToChannels],
      ['How to watch', () => showPanel('help')]
    ] : [
      ['Watch selected channel', () => tune(selected)],
      ['How to watch', () => showPanel('help')]
    ];
    actions.forEach(([label, action]) => {
      const button = document.createElement('button');
      button.className = 'panel-item';
      button.textContent = label;
      button.addEventListener('click', action);
      panelContent.append(button);
    });
    panelContent.firstElementChild.focus();
  }
  footer();
}

function closePanel(resume = true) {
  if (!panelKind) return;
  panelKind = '';
  panel.hidden = true;
  watchView.hidden = !watching;
  listView.hidden = watching;
  if (watching) {
    center.focus();
    if (resume && resumeAfterPanel && ready) player.playVideo();
  } else select(selected);
  resumeAfterPanel = false;
  footer();
}

function back() {
  if (panelKind) { closePanel(); return true; }
  if (watching) { goToChannels(); return true; }
  return false;
}

function primaryAction() {
  if (panelKind === 'help') closePanel();
  else if (panelKind) {
    const focused = document.activeElement;
    (focused?.matches('.panel-item') ? focused : panelContent.firstElementChild)?.click();
  } else if (watching) togglePlayback();
  else tune(selected);
}

$('soft-left').addEventListener('click', () => panelKind ? closePanel() : showPanel('options'));
center.addEventListener('click', primaryAction);
$('soft-right').addEventListener('click', () => { if (!back()) window.close(); });
$('youtube-link').addEventListener('click', openYouTube);

window.addEventListener('back', (event) => {
  // At the root leave this event untouched, so Cloud Phone can exit the widget.
  if (back()) event.preventDefault();
});
window.addEventListener('pagehide', dispose);
window.addEventListener('pageshow', (event) => { if (event.persisted) goToChannels(); });
window.addEventListener('resize', () => {
  if (!watching && !panelKind) list.children[selected].scrollIntoView({ block: 'nearest' });
});

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  const key = event.key;
  if (key === 'Escape' || key === 'SoftLeft') {
    event.preventDefault();
    if (!event.repeat) panelKind ? closePanel() : showPanel('options');
    return;
  }
  if (key === 'Backspace' || key === 'BrowserBack' || key === 'SoftRight') {
    if (back()) event.preventDefault();
    return;
  }
  if (key === 'Enter') {
    event.preventDefault();
    if (!event.repeat) {
      const focused = document.activeElement;
      if (focused?.matches('#soft-left, #soft-right, #youtube-link')) focused.click();
      else primaryAction();
    }
    return;
  }
  if (panelKind) {
    if (key === 'Tab' && panelKind === 'options') {
      event.preventDefault();
      movePanelFocus(event.shiftKey ? -1 : 1);
    } else if (key === 'ArrowUp' || key === 'ArrowDown') {
      event.preventDefault();
      if (panelKind === 'help') panelContent.scrollBy(0, key === 'ArrowUp' ? -35 : 35);
      else movePanelFocus(key === 'ArrowUp' ? -1 : 1);
    }
    return;
  }
  if (/^[1-9]$/.test(key)) {
    event.preventDefault();
    if (!event.repeat) tune(Number(key) - 1);
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

function movePanelFocus(direction) {
  const buttons = [...panelContent.querySelectorAll('button')];
  if (!buttons.length) return;
  const index = buttons.indexOf(document.activeElement);
  const next = buttons[(index + direction + buttons.length) % buttons.length];
  next.focus();
  next.scrollIntoView({ block: 'nearest' });
}

select(selected);
footer();
