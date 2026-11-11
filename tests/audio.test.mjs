import test from 'node:test';
import assert from 'node:assert/strict';
import { unmuteVideo, enableNativeAudio, systemVolume } from '../apps/malayalam-tv/audio.js';

test('sound recovery clears media mute and restores a zero playback volume', () => {
  const attributes = new Set(['muted']);
  const video = { muted: true, defaultMuted: true, volume: 0, removeAttribute: (name) => attributes.delete(name) };
  unmuteVideo(video);
  assert.equal(video.muted, false);
  assert.equal(video.defaultMuted, false);
  assert.equal(video.volume, 1);
  assert.equal(attributes.has('muted'), false);
  video.volume = 0.4;
  unmuteVideo(video);
  assert.equal(video.volume, 0.4, 'Existing nonzero volume is preserved');
});

test('native audio selects Malayalam or enables an available track when all tracks are disabled', () => {
  const english = { language: 'en', enabled: true };
  const malayalam = { language: 'mal', enabled: false };
  enableNativeAudio({ audioTracks: [english, malayalam] });
  assert.equal(malayalam.enabled, true);
  assert.equal(english.enabled, false);
  const only = { language: '', enabled: false };
  enableNativeAudio({ audioTracks: [only] });
  assert.equal(only.enabled, true);
  assert.doesNotThrow(() => enableNativeAudio({}));
});

test('system volume uses requestUp when a phone lacks requestShow', () => {
  const calls = [];
  const manager = { requestUp: () => calls.push('up'), requestDown: () => calls.push('down') };
  assert.equal(systemVolume(manager, 0), true);
  systemVolume(manager, -1);
  manager.requestShow = () => calls.push('show');
  systemVolume(manager, 0);
  systemVolume(manager, 1);
  assert.deepEqual(calls, ['up', 'down', 'show', 'up']);
  assert.equal(systemVolume(undefined, 1), false);
});
