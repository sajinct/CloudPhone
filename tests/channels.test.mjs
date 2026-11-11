import test from 'node:test';
import assert from 'node:assert/strict';
import { CHANNELS, sourceUrls } from '../apps/kerala-news/channels.js';

test('all nine supplied channels have valid, distinct video sources', () => {
  assert.equal(CHANNELS.length, 9);
  assert.equal(new Set(CHANNELS.map(({ id }) => id)).size, 9);
  for (const channel of CHANNELS) {
    const urls = sourceUrls(channel.id, 'https://news.example.com');
    const embed = new URL(urls.embed);
    assert.equal(embed.pathname, `/embed/${channel.id}`);
    assert.equal(embed.searchParams.get('origin'), 'https://news.example.com');
    assert.equal(embed.searchParams.get('enablejsapi'), '1');
    assert.equal(urls.watch, `https://www.youtube.com/watch?v=${channel.id}`);
  }
});

test('channel-based live sources keep their channel query alongside player parameters', () => {
  const urls = sourceUrls('live_stream?channel=UCexample_123', 'https://news.example.com');
  const embed = new URL(urls.embed);
  assert.equal(embed.pathname, '/embed/live_stream');
  assert.equal(embed.searchParams.get('channel'), 'UCexample_123');
  assert.equal(embed.searchParams.get('autoplay'), '1');
  assert.equal(urls.watch, 'https://www.youtube.com/channel/UCexample_123/live');
});

test('invalid sources cannot become arbitrary iframe URLs', () => {
  for (const id of ['https://evil.example/', '', 'short', 'live_stream?channel=bad&foo=bar', '<script>']) {
    assert.throws(() => sourceUrls(id, 'https://news.example.com'));
  }
  const { embed } = sourceUrls(CHANNELS[0].id, 'null');
  assert.equal(new URL(embed).searchParams.has('origin'), false);
});
