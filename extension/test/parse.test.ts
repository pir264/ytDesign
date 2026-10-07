import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseChannelHeader, parseComments, parseDetails, parseItems, parseSubscribed } from '../src/data/parse';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

describe('parseItems', () => {
  it('reads search results without Shorts', () => {
    const page = parseItems(fixture('search.json'));
    const videos = page.items.filter((i) => i.kind === 'video');
    expect(videos.length).toBeGreaterThanOrEqual(15);
    for (const v of videos) {
      expect(v.id).toMatch(/^[\w-]{11}$/);
      expect(v.title).not.toBe('');
      expect(v.thumb).toMatch(/^https:\/\//);
      expect(v.channel).toBeTruthy();
    }
    // a few streams have no length at all
    expect(videos.filter((v) => v.kind === 'video' && v.duration).length).toBeGreaterThan(videos.length * 0.8);
    expect(page.continuation).toBeTruthy();
    // shortsLockupViewModel items must not leak in
    const raw = JSON.stringify(fixture('search.json'));
    const shortIds = [...raw.matchAll(/"\/shorts\/([\w-]{11})"/g)].map((m) => m[1]);
    expect(shortIds.length).toBeGreaterThan(0);
    for (const id of shortIds) expect(page.items.find((i) => i.id === id)).toBeUndefined();
  });

  it('reads playlists (lockups) from search', () => {
    const page = parseItems(fixture('search.json'));
    const playlists = page.items.filter((i) => i.kind === 'playlist');
    expect(playlists.length).toBeGreaterThan(0);
    expect(playlists[0].firstVideoId).toMatch(/^[\w-]{11}$/);
  });

  it('reads a channel videos tab (lockupViewModel)', () => {
    const page = parseItems(fixture('channel.json'));
    expect(page.items.length).toBeGreaterThanOrEqual(20);
    const v = page.items[0];
    expect(v.kind).toBe('video');
    if (v.kind === 'video') {
      expect(v.duration).toMatch(/^\d+:\d\d/);
      expect(v.meta).toMatch(/ago/);
    }
    expect(page.continuation).toBeTruthy();
  });

  it('collects resume progress and history sections', () => {
    const json = {
      contents: {
        sectionListRenderer: {
          contents: [
            {
              itemSectionRenderer: {
                header: { itemSectionHeaderRenderer: { title: { simpleText: 'Today' } } },
                contents: [
                  {
                    videoRenderer: {
                      videoId: 'abcdefghijk',
                      title: { runs: [{ text: 'A video' }] },
                      ownerText: { runs: [{ text: 'Chan', navigationEndpoint: { browseEndpoint: { browseId: 'UC123' } } }] },
                      lengthText: { simpleText: '10:00' },
                      thumbnail: { thumbnails: [{ url: 'https://x/1.jpg', width: 1 }] },
                      thumbnailOverlays: [{ thumbnailOverlayResumePlaybackRenderer: { percentDurationWatched: 42 } }],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    };
    const [v] = parseItems(json).items;
    expect(v).toMatchObject({ id: 'abcdefghijk', progress: 42, section: 'Today', channel: 'Chan', channelId: 'UC123' });
  });
});

describe('channel and upload date', () => {
  const lockup = (rows: { content: string; channelId?: string }[][]) => ({
    lockupViewModel: {
      contentId: 'abcdefghijk',
      contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
      contentImage: { thumbnailViewModel: { image: { sources: [] }, overlays: [] } },
      metadata: {
        lockupMetadataViewModel: {
          title: { content: 'A video' },
          metadata: {
            contentMetadataViewModel: {
              metadataRows: rows.map((r) => ({
                metadataParts: r.map((p) => ({
                  text: {
                    content: p.content,
                    ...(p.channelId ? { commandRuns: [{ onTap: { innertubeCommand: { browseEndpoint: { browseId: p.channelId } } } }] } : {}),
                  },
                })),
              })),
            },
          },
        },
      },
    },
  });
  const parse = (rows: Parameters<typeof lockup>[0]) => parseItems({ items: [lockup(rows)] }).items[0];

  it('reads them from the usual two rows', () => {
    expect(parse([[{ content: 'Rick Astley' }], [{ content: '3.9M' }, { content: '4mo ago' }]])).toMatchObject({
      channel: 'Rick Astley',
      published: '4mo ago',
    });
  });

  it('reads them from a single row', () => {
    expect(parse([[{ content: 'Fireship' }, { content: '1.2M views' }, { content: '3 days ago' }]])).toMatchObject({
      channel: 'Fireship',
      published: '3 days ago',
    });
  });

  it('prefers the part that links to a channel', () => {
    expect(parse([[{ content: '1.2M views' }, { content: 'Core Dumped', channelId: 'UC123' }]])).toMatchObject({ channel: 'Core Dumped' });
  });

  it('finds no channel on a channel page (views and date only)', () => {
    const v = parse([[{ content: '1.2M views' }, { content: '1 day ago' }]]);
    expect(v).toMatchObject({ published: '1 day ago' });
    expect(v.kind === 'video' && v.channel).toBeFalsy();
  });

  it('reads the upload date of search results', () => {
    const videos = parseItems(fixture('search.json')).items.filter((i) => i.kind === 'video');
    expect(videos.filter((v) => v.kind === 'video' && v.published).length).toBeGreaterThan(videos.length * 0.7);
  });

  it('reads channel and date of related videos', () => {
    const related = parseItems(fixture('next.json')).items.filter((i) => i.kind === 'video');
    expect(related.length).toBeGreaterThan(5);
    for (const v of related) expect(v).toMatchObject({ channel: expect.any(String), published: expect.stringMatching(/ago/) });
  });
});

describe('details and comments', () => {
  it('parses the next endpoint', () => {
    const d = parseDetails(fixture('next.json'), 'dQw4w9WgXcQ');
    expect(d.title).toMatch(/Never Gonna Give You Up/);
    expect(d.channel?.name).toBe('Rick Astley');
    expect(d.channel?.id).toMatch(/^UC/);
    expect(d.channel?.subscribers).toMatch(/subscribers/);
    expect(d.description.length).toBeGreaterThan(50);
    expect(d.commentsToken).toBeTruthy();
  });

  it('parses a comments page with reply tokens and a next page', () => {
    const c = parseComments(fixture('comments.json'));
    expect(c.count).toMatch(/\d/);
    expect(c.comments.length).toBe(20);
    for (const cm of c.comments) {
      expect(cm.author).toBeTruthy();
      expect(cm.text).toBeTruthy();
      expect(cm.id).toBeTruthy();
    }
    const withReplies = c.comments.filter((cm) => cm.repliesToken);
    expect(withReplies.length).toBeGreaterThan(0);
    expect(withReplies[0].replyCount).toBeGreaterThan(0);
    expect(c.next).toBeTruthy();
    // the next page token is not one of the reply tokens
    expect(withReplies.map((cm) => cm.repliesToken)).not.toContain(c.next);
  });

  it('parses the next comments page', () => {
    const c = parseComments(fixture('comments-page2.json'));
    expect(c.comments.length).toBe(20);
    const first = parseComments(fixture('comments.json')).comments.map((cm) => cm.id);
    for (const cm of c.comments) expect(first).not.toContain(cm.id);
  });

  it('parses replies with a "show more replies" token', () => {
    const r = parseComments(fixture('replies.json'));
    expect(r.comments.length).toBe(10);
    expect(r.comments[0].repliesToken).toBeUndefined();
    expect(r.next).toBeTruthy();
  });

  it('reads the subscription state', () => {
    expect(parseSubscribed(fixture('next.json'), 'UCuAXFkgsw1L7xaCfnd5JJOw')).toBe(false);
    const flipped = JSON.parse(JSON.stringify(fixture('next.json')).replaceAll('"subscribed":false', '"subscribed":true'));
    expect(parseSubscribed(flipped, 'UCuAXFkgsw1L7xaCfnd5JJOw')).toBe(true);
    expect(parseSubscribed(fixture('channel.json'), 'UCsBjURrPoezykLs9EqgamOA')).toBeUndefined();
  });

  it('parses a channel header', () => {
    const h = parseChannelHeader(fixture('channel.json'));
    expect(h.name).toBe('Fireship');
    expect(h.subscribers).toMatch(/subscribers/);
  });
});
