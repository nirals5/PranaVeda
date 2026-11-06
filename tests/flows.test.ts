import { describe, expect, it } from 'vitest';
import { BUILT_IN_CATALOG, publicCatalog } from '../api/index.js';
import { FLOW_GROUPS, flows, flowsWithPose } from '../api/_lib/flows.js';

describe('Flows', () => {
  it('each has a unique id, a known group and a video and cover on the media domain', () => {
    expect(new Set(flows.map((f) => f.id)).size).toBe(flows.length);
    for (const f of flows) {
      expect(FLOW_GROUPS).toContain(f.group);
      expect(f.videoUrl).toBe(`https://media.pranaveda.app/videos/${f.id}.mp4`);
      expect(f.coverUrl).toBe(`https://media.pranaveda.app/videos/${f.id}.jpg`);
      expect(f.minutes).toBeGreaterThanOrEqual(1);
    }
  });

  it('links only poses the catalog has', () => {
    const ids = new Set(BUILT_IN_CATALOG.poses.map((p) => p.id));
    for (const f of flows) for (const pose of f.poses) expect(ids, `${f.id} → ${pose}`).toContain(pose);
  });

  it('every group has at least one flow', () => {
    for (const g of FLOW_GROUPS) expect(flows.some((f) => f.group === g), g).toBe(true);
  });

  it('finds the flows that feature a pose', () => {
    expect(flowsWithPose('cat_cow').map((f) => f.id)).toEqual(['cat_cow_series_with_bolster', 'cat_cow_series_with_yoga_block']);
    expect(flowsWithPose('tree_pose')).toEqual([]);
  });

  it('are in the catalog the apps load', () => {
    expect(publicCatalog('https://pranaveda.app').flows).toBe(flows);
  });
});
