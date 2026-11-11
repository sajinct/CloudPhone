# Malayalam TV

A separate Cloud Phone widget for the Nokia 3210, hosted at **https://sajinct.github.io/CloudPhone/malayalam-tv/**.

Register **Malayalam TV** as a new widget in the Cloud Phone console using that URL and `icon-512.png` from this directory. `icon-80.png` is included for older icon fields. This does not share channel preferences or favorites with Kerala News.

## Channels

The app fetches [IPTV-org's Malayalam playlist](https://iptv-org.github.io/iptv/languages/mal.m3u) when opened and via **Options → Refresh playlist**. It parses channel names and categories, skips malformed/duplicate stream URLs, and displays all valid HTTP/HTTPS entries. If the live feed cannot be loaded within 10 seconds, it tries a previously saved feed and then the bundled `playlist.m3u` snapshot. The footer identifies the source being used. Refreshing never replaces a good cache with invalid data.

## Keypad

| Key | Action |
| --- | --- |
| ↑ / ↓ | Browse channels; adjust volume while watching |
| OK | Watch; play / pause; retry after an error |
| ← / → | Previous / next channel in the selected category |
| 1–9 | Watch the first nine channels in the current list |
| # | Add / remove current channel from Favorites |
| 0 | Enable media sound and show system volume controls (raise one step on phones without a volume-menu API) |
| * | Toggle full screen while watching; desktop keyboards can also use F |
| Left soft key / Escape | Options, categories, favorites, refresh and help |
| Right soft key | Close menu; exit full screen; return from player; exit at the channel list |

The last selected channel and favorites are saved locally when browser storage is available. Menus pause active playback. Returning to channels stops the stream and releases its player.

**Sound on the Nokia:** device testing found audio works in Cloud Phone's native fullscreen player while inline video is silent. Cloud Phone therefore starts every channel in the native fullscreen player, and never sets the inline opt-out. Leaving fullscreen pauses playback; OK resumes in the native player. Desktop browsers keep embedded playback. **Enable sound** also clears media mute, enables a native audio track when available (preferring Malayalam), and raises system volume one step. Use ↑ / ↓ for further adjustment.

**Full screen:** automatic on Cloud Phone. On desktop choose the button below the video, **Options → Full screen**, or press **\***. Header, footer and channel details are hidden so the video fills the screen without cropping. No unsupported browser Fullscreen API is required. Press the right soft key or * to leave fullscreen before returning to channels; on desktop, the onscreen Back button is also available. On Cloud Phone leaving fullscreen pauses the video so it does not continue silently in the embedded view.

## Playback

Cloud Phone uses native HLS and `navigator.volumeManager`, without downloading HLS.js or setting `x-puffin-playsinline`. Other browsers keep that inline attribute. Safari and HLS-capable browsers without MediaSource also use native playback; compatible desktop Chromium browsers load the locally vendored **HLS.js 1.7.4** player on demand. The desktop player starts at the lowest quality, caps adaptive quality to the display, and selects a Malayalam audio track when one is identified. Native playback selects a Malayalam track when `audioTracks` is exposed; otherwise the platform chooses its audio track.

Stream availability and region restrictions come from the broadcaster. Some entries are not broadcasting 24/7. HTTP-only streams cannot play in an HTTPS page; DASH and DRM-protected entries are unsupported and show an explanation. Per-stream user-agent/referrer directives in M3U/VLC metadata cannot be applied by a static browser app. Native playback and desktop playback may differ because of codecs, CORS, redirects, nested HTTP URLs, and broadcaster restrictions. The app does not proxy streams or bypass these requirements. Test actual playback and volume on the Nokia before catalog submission.

The stream list comes from [IPTV-org](https://github.com/iptv-org/iptv); its license is included in `IPTV-LICENSE`. The HLS.js library and license are in `vendor/`. `sources.json` records the exact download sources, versions, and checksums. No video content is bundled or hosted by this app.

## Local development and deployment

From the repository root, `npm start` serves this app at **http://127.0.0.1:3210/malayalam-tv/**. Run `npm test` for parser and fallback tests, and `npm run test:tv` for headless browser integration checks. `npm run build` prepares both apps under ignored `artifacts/pages`; the Pages workflow deploys that directory while preserving Kerala News at the site root.
