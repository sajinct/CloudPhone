# CloudPhone apps

Custom web widgets for CloudMosa Cloud Phone on the Nokia 3210. The first app is **Kerala News**, a keypad-friendly launcher and YouTube player for nine Malayalam news channels.

- **App:** [Kerala News](https://sajinct.github.io/CloudPhone/)
- **Source:** [sajinct/CloudPhone](https://github.com/sajinct/CloudPhone)
- **Separate TV app:** [Malayalam TV](https://sajinct.github.io/CloudPhone/malayalam-tv/) — IPTV-org live channels, categories and favorites; see [its setup guide](apps/malayalam-tv/README.md).

## GitHub Pages deployment

The `.github/workflows/pages.yml` workflow runs the tests, prepares both apps with `npm run build`, and publishes the generated `artifacts/pages/` directory on every push to `main`. Kerala News stays at the existing site root; Malayalam TV has its own `/malayalam-tv/` URL and widget icons. Repository scripts, tests, and local browser profiles are not part of the hosted site. GitHub Pages must be configured to use **GitHub Actions** as its publishing source.

Use **https://sajinct.github.io/CloudPhone/** as the widget URL in the Cloud Phone console. The icon is available at **https://sajinct.github.io/CloudPhone/icon-512.png** (or `icon-80.png` for the older size).

## Run Kerala News

Install Node.js 22 or newer, then run from this directory:

```sh
npm start
```

Open **http://127.0.0.1:3210** in a desktop browser. No dependency installation or build step is required. The phone uses the hosted HTTPS version, not this localhost address. Do not open `index.html` directly using `file://`; YouTube needs an HTTP origin and referrer.

## Controls

| Key | Channel list | Player |
| --- | --- | --- |
| Up / Down | Move selection | Raise / lower volume |
| OK / Enter | Watch selection | Play / pause (retry after an error) |
| 1–9 | Watch that channel | Watch that channel |
| Left / Right | — | Previous / next channel |
| 0 | — | Show volume controls |
| Left soft key / Escape | Options | Options |
| Right soft key | Exit | Return to channels |
| Backspace (desktop) | — | Return to channels |

The Options menu includes help, retry, volume, and **Open in YouTube**. Menus pause a playing video and restore it when closed. The app remembers the selected channel when browser storage is available. It loads the YouTube player only after a channel is selected and removes it on returning to the list.

Cloud Phone's left soft key generates `Escape`, and its right soft key generates the cancelable global `back` event. At the channel list the event is left untouched so the platform can exit. The native Volume Manager is used when available; desktop browsers use the YouTube player's volume control. The Cloud Phone simulator cannot validate native system volume behavior.

## Change channels

Edit `apps/kerala-news/channels.js`. The supplied video IDs are preserved exactly. When a broadcaster starts a replacement live stream, update its ID here and redeploy.

```js
{ id: "1wECsnGZcfc", name: "24" }
// Channel-based live embed, where supported by YouTube:
{ id: "live_stream?channel=UC_CHANNEL_ID", name: "Channel name" }
```

YouTube and each broadcaster decide whether a stream is live, available in a region, or permitted in embeds. The app reports player errors, blocked autoplay, loading failures, and ended broadcasts, with a YouTube fallback. It does not extract, proxy, or download video streams. The direct YouTube page is a fallback and has its own keypad behavior. No YouTube API key is needed.

The primary layout targets **240 × 320**. The channel list also fits **128 × 160**, **240 × 240**, and **320 × 240**. YouTube requires an embedded player of at least **200 × 200**; screens below 200 pixels wide or 285 pixels tall offer the direct YouTube page instead of clipping or scaling the player.

## Host and register with Cloud Phone

1. Upload the contents of **`apps/kerala-news/`** to a static HTTPS host. Preserve its relative asset paths. GitHub Pages, Cloudflare Pages, Netlify, or an existing static host can serve these files. No server-side code is needed in production.
2. Open the public HTTPS app URL and test an actual stream. Keep the `strict-origin-when-cross-origin` referrer policy, or a similarly compatible policy; `no-referrer` can cause YouTube error 153. Avoid host-level headers that block YouTube framing or scripts.
3. Sign in to the [Cloud Phone developer console](https://www.cloudphone.tech/my). Register a widget named **Kerala News** with the HTTPS URL and **`icon-512.png`**. An **`icon-80.png`** is included for portal fields requiring the older icon size. Both are opaque RGB PNGs.
4. In Cloud Phone on your Nokia, open **Settings → About**, press the left soft key seven times, and confirm developer mode. Add your device IMEI privately in your developer account, then close and reopen Cloud Phone to find your unpublished widget. Do not commit an IMEI or console credentials to this project.
5. Test every channel, playback, volume, switching, retry, and right-soft-key return on the actual phone. The simulator is also available in the console.
6. For public catalog distribution, follow the developer portal's submission process and contact Cloud Phone for publication review. Creating a development widget does not publish it to the catalog.

**Cloud Phone status:** console registration and real-device playback verification are still required. GitHub Pages hosting is separate from publication in the Cloud Phone widget catalog.

## Validation

```sh
npm test
npm run test:browser
```

The browser check uses installed Chrome (or set `CHROME_PATH`) and Node's built-in DevTools client. It launches its own headless profile under ignored `artifacts/`, tests keypad navigation, player lifecycle, API errors, and screen layouts, and saves screenshots there. YouTube is mocked for deterministic browser checks; these checks do not certify live stream availability or Cloud Phone hardware behavior.

## Platform references

- [Cloud Phone design and soft keys](https://developer.cloudfone.com/docs/guides/cloud-phone-design/)
- [Cloud Phone multimedia and Volume Manager](https://developer.cloudfone.com/docs/reference/multimedia/)
- [Developer mode and simulator](https://developer.cloudfone.com/docs/guides/developer-tools/)
- [Widget hosting and publication](https://developer.cloudfone.com/docs/guides/your-first-widget/)
- [YouTube iframe API requirements and errors](https://developers.google.com/youtube/iframe_api_reference)
