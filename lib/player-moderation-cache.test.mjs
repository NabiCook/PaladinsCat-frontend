/** Verify fresh badge reads across observation expiry and owner preference edits. · refs: see lib/player-moderation.ts */
import assert from "node:assert/strict";
import test from "node:test";
import { fetchPlayerModeration, fetchPlayerModerationBatch, invalidatePlayerModeration } from "./player-moderation.ts";

test("fresh moderation reads preserve observation expiry and administrative decisions", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = 1_000;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls += 1;
    const id = Number(new URL(String(url), "http://fixture").searchParams.get("ids"));
    return {
      ok: true,
      json: async () => ({ players: [{
        id,
        wall_shooter_count: now < 2_000 ? 5 : 0,
        automatic_tag_expires_at: now < 2_000 ? 2_000 : null,
        cheater: true,
      }] }),
    };
  };
  Date.now = () => now;
  try {
    const batch = await fetchPlayerModerationBatch([930001]);
    assert.equal(batch.get(930001).wallShooterCount, 5);
    assert.equal((await fetchPlayerModeration(930002)).wallShooterCount, 5);
    assert.equal(calls, 2);
    now = 1_999;
    await Promise.all([fetchPlayerModeration(930001), fetchPlayerModeration(930002)]);
    assert.equal(calls, 3, "fresh reads may coalesce concurrently, not reuse settled counts");
    now = 2_000;
    for (const id of [930001, 930002]) {
      const refreshed = await fetchPlayerModeration(id);
      assert.equal(refreshed.wallShooterCount, 0);
      assert.equal(refreshed.cheater, true, "administrative decisions do not expire");
    }
    assert.equal(calls, 5, "each settled read must refresh regardless of observation expiry");
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});

test("owner tag changes and clears are fresh without retaining other players' badges", async () => {
  const originalFetch = globalThis.fetch;
  let customTag = "Approved";
  let customTagColor = "#c4b5fd";
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls += 1;
    const ids = new URL(String(url), "http://fixture").searchParams.get("ids").split(",").map(Number);
    return { ok: true, json: async () => ({ players: ids.map((id) => ({ id, custom_tag: customTag, custom_tag_color: customTagColor })) }) };
  };
  try {
    await fetchPlayerModerationBatch([940001, 940002]);
    customTagColor = "#ffe595";
    invalidatePlayerModeration(940001);
    assert.equal((await fetchPlayerModeration(940001)).customTagColor, "#ffe595");
    assert.equal((await fetchPlayerModeration(940002)).customTagColor, "#ffe595");
    customTag = null;
    invalidatePlayerModeration("940001");
    assert.equal((await fetchPlayerModeration(940001)).customTag, null);
    assert.equal((await fetchPlayerModeration(940002)).customTag, null);
    assert.equal(calls, 5, "every settled read observes current tags without player-result caching");
    customTag = "Approved";
    invalidatePlayerModeration(940001);
    assert.equal((await fetchPlayerModeration(940001)).customTag, "Approved");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
