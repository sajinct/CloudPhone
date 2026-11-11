import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { once } from 'node:events';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function outputUntil(stream, pattern) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Process did not start: ${output}`)), 15000);
    stream.on('data', (data) => {
      output += data;
      const match = output.match(pattern);
      if (match) { clearTimeout(timeout); resolve(match); }
    });
  });
}

export async function openBrowser(port = 13211) {
  const artifacts = resolve('artifacts');
  await mkdir(artifacts, { recursive: true });
  const profile = await mkdtemp(resolve(artifacts, 'tv-chrome-'));
  const server = spawn(process.execPath, ['scripts/serve.mjs'], {
    env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
  });
  let browser;
  let socket;
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const sequence = ++id;
    const timeout = setTimeout(() => { pending.delete(sequence); reject(new Error(`Timeout: ${method}`)); }, 15000);
    pending.set(sequence, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id: sequence, method, params }));
  });
  const close = async () => {
    if (socket?.readyState === WebSocket.OPEN) {
      await cdp('Browser.close').catch(() => {});
      socket.close();
    }
    browser?.kill();
    server.kill();
  };
  try {
    await outputUntil(server.stdout, /Malayalam TV:/);
    browser = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
      '--headless=new', '--disable-gpu', '--disable-crash-reporter', '--disable-breakpad', '--no-first-run', '--no-default-browser-check',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
    ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    const match = await outputUntil(browser.stderr, /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
    const tabs = await (await fetch(`http://127.0.0.1:${match[1]}/json/list`)).json();
    socket = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl);
    await once(socket, 'open');
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timeout);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    });
    await cdp('Page.enable');
    await cdp('Runtime.enable');
    await cdp('Network.enable');
    const evaluate = async (expression) => {
      const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    return {
      cdp, evaluate, exceptions, close,
      async until(expression, attempts = 120) {
        for (let i = 0; i < attempts; i++) {
          if (await evaluate(expression)) return;
          await delay(50);
        }
        throw new Error(`Condition not reached: ${expression}`);
      },
      async key(key) {
        const codes = { Enter: 13, Escape: 27, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Backspace: 8, Tab: 9 };
        for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: codes[key] || key.charCodeAt(0) });
      },
      viewport: (width, height) => cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true }),
      async screenshot(name) {
        const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
        await writeFile(resolve(artifacts, name), Buffer.from(data, 'base64'));
      }
    };
  } catch (error) { await close(); throw error; }
}
