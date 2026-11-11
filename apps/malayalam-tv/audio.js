// Cloud Phone has a separate system-volume API. Unmute the media element as
// well: changing system volume alone does not clear a muted video element.
export function unmuteVideo(video) {
  if (!video) return;
  video.defaultMuted = false;
  video.muted = false;
  video.removeAttribute('muted');
  if (video.volume === 0) video.volume = 1;
}

export function enableNativeAudio(video) {
  const tracks = video?.audioTracks;
  if (!tracks?.length) return;
  const available = Array.from(tracks);
  const preferred = available.find((track) => /^(?:ml|mal)$/i.test(track.language || '') || /malayalam/i.test(track.label || ''))
    || available.find((track) => track.enabled) || available[0];
  for (const track of available) track.enabled = track === preferred;
}

export function systemVolume(manager, direction) {
  // Some clients implement requestUp/requestDown without requestShow.
  const method = direction > 0 ? 'requestUp' : direction < 0 ? 'requestDown'
    : typeof manager?.requestShow === 'function' ? 'requestShow' : 'requestUp';
  if (typeof manager?.[method] !== 'function') return false;
  manager[method]();
  return true;
}
