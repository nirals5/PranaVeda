import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import app, { BREATHWORK, POSES, assetUrl, publicCatalog, registerChatRoute, sceneImagePath } from '../api/index.js';

const PUBLIC_DIR = path.resolve(__dirname, '../public');
const imageUrls = (pose: { poseImageUrl?: string; sceneImageUrl?: string }) =>
  [pose.poseImageUrl, pose.sceneImageUrl].filter((u): u is string => !!u);

afterEach(() => {
  delete process.env.PUBLIC_ASSET_BASE_URL;
});

describe('catalog artwork', () => {
  it('points only at images that exist in public/', () => {
    const missing = POSES.flatMap((pose) => [pose.poseImageUrl, sceneImagePath(pose.id)])
      .filter((url): url is string => !!url && url.startsWith('/'))
      .filter((url) => !existsSync(path.join(PUBLIC_DIR, url)));
    expect(missing).toEqual([]);
  });

  it('uses every room scene Niral made, and only those', () => {
    const scenesOnDisk = new Set(
      readdirSync(path.join(PUBLIC_DIR, 'poses_with_background/web'))
        .filter((f) => f.endsWith('.webp'))
        .map((f) => f.replace(/(_wide)?\.webp$/, ''))
    );
    const scenesInCatalog = new Set(POSES.map((p) => p.id).filter((id) => sceneImagePath(id)));
    expect([...scenesInCatalog].sort()).toEqual([...scenesOnDisk].sort());
  });

  it('chooses the landscape version where a pose has one', () => {
    expect(sceneImagePath('triangle')).toBe('/poses_with_background/web/triangle_wide.webp');
    expect(sceneImagePath('cobra')).toBe('/poses_with_background/web/cobra.webp');
    expect(sceneImagePath('tadasana')).toBeUndefined();
  });
});

describe('publicCatalog', () => {
  it('turns every site path into a full address and leaves third-party addresses alone', () => {
    const catalog = publicCatalog('https://pranaveda.example');
    expect(catalog.poses).toHaveLength(POSES.length);
    expect(catalog.breathwork).toHaveLength(BREATHWORK.length);
    for (const pose of catalog.poses) {
      for (const url of imageUrls(pose)) expect(url).toMatch(/^https:\/\//);
    }
    expect(catalog.poses.find((p) => p.id === 'cobra')).toMatchObject({
      poseImageUrl: 'https://pranaveda.example/poses/cobra.jpg',
      sceneImageUrl: 'https://pranaveda.example/poses_with_background/web/cobra.webp',
    });
    const unsplash = catalog.poses.find((p) => p.id === 'tadasana')!;
    expect(unsplash.poseImageUrl).toMatch(/^https:\/\/images\.unsplash\.com\//);
    expect(unsplash.sceneImageUrl).toBeUndefined();
  });

  it('keeps everything else about each pose', () => {
    const cobra = publicCatalog('https://x.example').poses.find((p) => p.id === 'cobra')!;
    const original = POSES.find((p) => p.id === 'cobra')!;
    expect({ ...cobra, poseImageUrl: original.poseImageUrl, sceneImageUrl: undefined }).toEqual({ ...original, sceneImageUrl: undefined });
  });

  it('leaves paths as they are when there is no base', () => {
    expect(assetUrl('/poses/cobra.jpg', '')).toBe('/poses/cobra.jpg');
    expect(assetUrl('https://cdn.example/a.jpg', 'https://x.example')).toBe('https://cdn.example/a.jpg');
    expect(assetUrl(undefined, 'https://x.example')).toBeUndefined();
  });
});

describe('GET /api/catalog', () => {
  it('serves the catalog with addresses on the site the request came to', async () => {
    const res = await request(app).get('/api/catalog').set('Host', 'pranaveda.example').set('X-Forwarded-Proto', 'https');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(res.body.poses).toHaveLength(POSES.length);
    expect(res.body.breathwork).toHaveLength(BREATHWORK.length);
    expect(res.body.poses.find((p: any) => p.id === 'bridge').poseImageUrl).toBe('https://pranaveda.example/poses/bridge.jpg');
    const relative = res.body.poses.flatMap(imageUrls).filter((u: string) => !u.startsWith('https://'));
    expect(relative).toEqual([]);
  });

  it('uses PUBLIC_ASSET_BASE_URL when it is set', async () => {
    process.env.PUBLIC_ASSET_BASE_URL = 'https://cdn.pranaveda.example/';
    const res = await request(app).get('/api/catalog').set('Host', 'some-preview.vercel.app');
    expect(res.body.poses.find((p: any) => p.id === 'bridge').sceneImageUrl).toBe(
      'https://cdn.pranaveda.example/poses_with_background/web/bridge.webp'
    );
  });
});

describe('ritual cards', () => {
  // A stand-in for Claude that asks for one ritual, then stops.
  const ritualTurn = {
    stop_reason: 'tool_use',
    content: [
      {
        type: 'tool_use',
        id: 't1',
        name: 'create_ritual',
        input: {
          title: 'Evening wind-down',
          description: 'Slow and grounding',
          summary: 'For a restless evening',
          doshaTendency: 'Vata',
          primaryEnergy: 'Scattered Wind',
          poses: [
            { poseId: 'triangle', durationMinutes: 2 },
            { poseId: 'tadasana', durationMinutes: 1 },
          ],
          breathworkId: 'sama_vritti',
          ayurvedic: { assessment: 'x', doshaPrimary: 'Vata', dietaryTips: [], lifestyleTips: [], recommendedHerbs: [] },
          lifestyleTips: [],
        },
      },
    ],
  };
  const endTurn = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Enjoy.' }] };

  const ritualPoses = async () => {
    const turns = [ritualTurn, endTurn];
    const fakeClaude = { messages: { stream: () => { const m = turns.shift(); return { on: () => {}, finalMessage: async () => m }; } } } as any;
    const chat = express();
    chat.use(express.json());
    registerChatRoute(chat, fakeClaude, 'test-key');
    const res = await request(chat).post('/api/chat').set('Host', 'some-preview.vercel.app').send({ messages: [{ role: 'user', content: 'hi' }] });
    const card = res.text
      .split('\n')
      .filter((l) => l.startsWith('data: '))
      .map((l) => JSON.parse(l.slice(6)))
      .find((e) => e.type === 'card')?.card;
    return card.result.yogaPractice.poses;
  };

  it('carry the room scene for poses that have one, as paths that work on any copy of the site', async () => {
    const [triangle, tadasana] = await ritualPoses();
    expect(triangle).toMatchObject({
      poseId: 'triangle',
      poseImageUrl: '/poses/triangle.jpg',
      sceneImageUrl: '/poses_with_background/web/triangle_wide.webp',
    });
    expect(tadasana.sceneImageUrl).toBeUndefined();
    // Never the address of the request: cards are saved and synced.
    expect(JSON.stringify([triangle, tadasana])).not.toContain('some-preview');
  });

  it('use PUBLIC_ASSET_BASE_URL when it is set', async () => {
    process.env.PUBLIC_ASSET_BASE_URL = 'https://pranaveda.example';
    const [triangle] = await ritualPoses();
    expect(triangle.poseImageUrl).toBe('https://pranaveda.example/poses/triangle.jpg');
    expect(triangle.sceneImageUrl).toBe('https://pranaveda.example/poses_with_background/web/triangle_wide.webp');
  });
});
