// Dependency-free integration checks against a separate headless Chrome profile.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { once } from 'node:events';

const artifacts = resolve('artifacts');
await mkdir(artifacts, { recursive: true });
const profile = await mkdtemp(resolve(artifacts, 'chrome-'));
const chrome = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  env: { ...process.env, PORT: '13210' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
});
let browser;
let socket;
const pending = new Map();
let sequence = 0;
const exceptions = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function outputUntil(stream, pattern) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Process did not become ready: ${output}`)), 15000);
    stream.on('data', (data) => {
      output += data;
      const match = output.match(pattern);
      if (match) { clearTimeout(timeout); resolve(match); }
    });
  });
}

function cdp(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

async function until(expression) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(expression)) return;
    await delay(30);
  }
  throw new Error(`Condition not reached: ${expression}`);
}

async function key(key) {
  const codes = { Enter: 13, Escape: 27, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Backspace: 8, Tab: 9 };
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: codes[key] || key.charCodeAt(0) });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: codes[key] || key.charCodeAt(0) });
}

async function viewport(width, height) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
}

async function screenshot(name) {
  const result = await cdp('Page.captureScreenshot', { format: 'png' });
  await writeFile(resolve(artifacts, name), Buffer.from(result.data, 'base64'));
}

const mock = `
  window.__players = [];
  window.YT = { Player: class {
    constructor(id, options) {
      this.frame = document.getElementById(id);
      this.events = options.events;
      this.volume = 50;
      this.dead = false;
      window.__players.push(this);
      setTimeout(() => this.events.onReady({target: this}), 10);
    }
    emit(data) { this.events.onStateChange({data, target: this}); }
    playVideo() { this.playing = true; this.emit(1); }
    pauseVideo() { this.playing = false; this.emit(2); }
    destroy() { this.dead = true; this.frame.remove(); }
    getVolume() { return this.volume; }
    setVolume(value) { this.volume = value; }
    unMute() {}
  }};
`;

try {
  await outputUntil(server.stdout, /Kerala News:/);
  browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--disable-crash-reporter', '--disable-breakpad', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], {
    stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true
  });
  browser.on('error', (error) => console.error(error.message));
  const match = await outputUntil(browser.stderr, /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
  const tabs = await (await fetch(`http://127.0.0.1:${match[1]}/json/list`)).json();
  socket = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl);
  await once(socket, 'open');
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timeout);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Network.enable');
  await cdp('Network.setBlockedURLs', { urls: ['*youtube.com*', '*googlevideo.com*'] });
  const injection = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: mock });
  await viewport(240, 320);
  await cdp('Page.navigate', { url: 'http://127.0.0.1:13210' });
  await until('document.querySelectorAll(".channel").length === 9');
  assert.equal(await evaluate('document.querySelectorAll("iframe").length'), 0, 'No player is loaded before selection');
  await screenshot('kerala-news-240x320.png');

  await key('ArrowUp');
  assert.equal(await evaluate('document.activeElement.textContent'), '9Kairali›', 'Up wraps to final channel');
  await key('Enter');
  await until('document.getElementById("soft-center").textContent === "Pause"');
  assert.equal(await evaluate('document.getElementById("heading").textContent'), 'Kairali');
  assert.equal(await evaluate('document.querySelector("iframe").getBoundingClientRect().height >= 200'), true);
  await screenshot('kerala-news-player-240x320.png');
  await key('Enter');
  assert.equal(await evaluate('document.getElementById("soft-center").textContent'), 'Play');
  await key('Enter');
  assert.equal(await evaluate('window.__players.at(-1).playing'), true);

  await key('ArrowRight');
  await until('document.getElementById("soft-center").textContent === "Pause"');
  assert.equal(await evaluate('document.getElementById("heading").textContent'), '24');
  assert.equal(await evaluate('window.__players.at(-2).dead'), true, 'Switching destroys previous player');
  await key('ArrowUp');
  assert.equal(await evaluate('window.__players.at(-1).volume'), 60);
  await evaluate('window.__volumeCalls = []; Object.defineProperty(navigator, "volumeManager", { configurable: true, value: { requestUp(){ __volumeCalls.push("up") }, requestDown(){ __volumeCalls.push("down") }, requestShow(){ __volumeCalls.push("show") } } })');
  await key('ArrowDown');
  await key('0');
  assert.deepEqual(await evaluate('window.__volumeCalls'), ['down', 'show']);

  await key('Escape');
  assert.equal(await evaluate('document.activeElement.textContent'), 'Volume');
  assert.equal(await evaluate('window.__players.at(-1).playing'), false, 'Menu pauses playback');
  await key('Escape');
  assert.equal(await evaluate('window.__players.at(-1).playing'), true, 'Closing menu resumes playback');

  for (const code of [100, 101, 150, 153]) {
    await evaluate(`window.__players.at(-1).events.onError({ data: ${code} })`);
    assert.equal(await evaluate('document.getElementById("youtube-link").hidden'), false);
    assert.equal(await evaluate('document.getElementById("soft-center").textContent'), 'Retry');
    await key('Enter');
    await until('document.getElementById("soft-center").textContent === "Pause"');
  }
  await evaluate('window.__players.at(-1).events.onAutoplayBlocked()');
  assert.equal(await evaluate('document.getElementById("soft-center").textContent'), 'Play');
  await key('Enter');
  await until('document.getElementById("soft-center").textContent === "Pause"');
  assert.equal(await evaluate('!window.dispatchEvent(new Event("back", {cancelable: true}))'), true);
  assert.equal(await evaluate('document.querySelectorAll("iframe").length'), 0, 'Back removes player');
  assert.equal(await evaluate('document.activeElement.textContent'), '124›', 'Back restores channel focus');
  assert.equal(await evaluate('window.dispatchEvent(new Event("back", {cancelable: true}))'), true, 'Root back is not intercepted');

  await key('Escape');
  await key('ArrowDown');
  await key('Enter');
  assert.equal(await evaluate('document.getElementById("panel-title").textContent'), 'How to watch');
  await key('Backspace');
  await key('9');
  await until('document.getElementById("soft-center").textContent === "Pause"');
  assert.equal(await evaluate('document.getElementById("heading").textContent'), 'Kairali');
  await key('Backspace');

  for (const [width, height] of [[128, 160], [240, 240], [320, 240], [800, 700]]) {
    await viewport(width, height);
    await screenshot(`kerala-news-${width}x${height}.png`);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `No horizontal overflow ${width}x${height}`);
    const footerBottom = await evaluate('document.querySelector(".softkeys").getBoundingClientRect().bottom');
    assert.ok(footerBottom <= height, `Footer remains on screen ${width}x${height}`);
    await key('1');
    if (width < 200 || height < 285) {
      assert.equal(await evaluate('document.querySelectorAll("iframe").length'), 0, 'Small screens use fallback');
      assert.equal(await evaluate('document.getElementById("youtube-link").hidden'), false);
    } else await until('document.getElementById("soft-center").textContent === "Pause"');
    await key('Backspace');
  }

  // Slow API loading followed by Back must never resurrect a disposed player.
  await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: injection.identifier });
  await viewport(240, 320);
  await cdp('Page.reload', { ignoreCache: true });
  await until('document.querySelectorAll(".channel").length === 9');
  await key('1');
  await key('Backspace');
  await evaluate(`${mock}; window.onYouTubeIframeAPIReady()`);
  await delay(100);
  assert.equal(await evaluate('document.querySelectorAll("iframe").length'), 0);
  assert.equal(await evaluate('window.__players.length'), 0);

  await evaluate('delete window.YT');
  await key('1');
  await until('document.getElementById("soft-center").textContent === "Retry"');
  assert.equal(await evaluate('document.getElementById("youtube-link").hidden'), false, 'API loading failure exposes fallback');
  assert.equal(exceptions.length, 0, `No uncaught exceptions: ${JSON.stringify(exceptions)}`);
  console.log('Browser checks passed: navigation, lifecycle, autoplay, errors, volume, API races, and five screen sizes.');
  console.log(`Screenshots: ${artifacts}`);
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    await cdp('Browser.close').catch(() => {});
    socket.close();
  }
  browser?.kill();
  server.kill();
}
