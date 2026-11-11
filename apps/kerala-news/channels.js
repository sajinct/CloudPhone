// Change a video ID here when a broadcaster replaces its live stream.
// A channel-based source may also be used: live_stream?channel=UC_CHANNEL_ID
export const CHANNELS = Object.freeze([
  { id: "1wECsnGZcfc", name: "24" },
  { id: "0QMlfUjUVzk", name: "Asianet News" },
  { id: "nObUcHKZEGY", name: "Reporter" },
  { id: "vnFyrDE20G8", name: "Big TV" },
  { id: "tgBTspqA5nY", name: "Manorama" },
  { id: "RbxEftGN584", name: "Mathrubhumi" },
  { id: "T9Ol2JHqKlM", name: "Janam" },
  { id: "-8d8-c0yvyU", name: "Media One" },
  { id: "yiiqRHY1Bl8", name: "Kairali" }
]);

export function sourceUrls(id, origin) {
  const live = /^live_stream\?channel=(UC[A-Za-z0-9_-]+)$/.exec(id);
  if (!live && !/^[A-Za-z0-9_-]{11}$/.test(id)) {
    throw new Error("Use an 11-character YouTube video ID or live_stream?channel=UC_CHANNEL_ID.");
  }
  const embed = new URL(live ? "https://www.youtube.com/embed/live_stream" : `https://www.youtube.com/embed/${id}`);
  if (live) embed.searchParams.set("channel", live[1]);
  for (const [key, value] of Object.entries({ autoplay: 1, playsinline: 1, enablejsapi: 1, rel: 0, disablekb: 1 })) {
    embed.searchParams.set(key, value);
  }
  if (/^https?:\/\//.test(origin)) embed.searchParams.set("origin", origin);
  return {
    embed: embed.href,
    watch: live ? `https://www.youtube.com/channel/${live[1]}/live` : `https://www.youtube.com/watch?v=${id}`
  };
}
