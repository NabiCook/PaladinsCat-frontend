import assert from "node:assert/strict";
import test from "node:test";
import { activeNewFeatures, parseNewFeaturesDocument } from "./feature-feed.ts";

test("parses typed entries and rejects malformed records", () => {
  const document = parseNewFeaturesDocument(`---
title: New Features
entries:
  - id: valid-release
    kind: new
    category: stats
    status: released
    targetVersion: v1.2.3
    publishedAt: "2026-09-09T12:00:00Z"
    sourceUrl: https://github.com/NabiCook/PaladinsCat/discussions/1
    title: Valid release
    summary: A useful customer-facing change.
  - id: Invalid ID
    kind: new
    category: stats
    status: released
    targetVersion: v1.2.3
    publishedAt: "2026-09-09T12:00:00Z"
    title: Invalid release
    summary: This entry is discarded.
  - id: unsafe-link
    kind: new
    category: stats
    status: upcoming
    targetVersion: Next release
    title: Unsafe link
    summary: Protocol-relative links are discarded.
    href: //example.com
---`);
  assert.deepEqual(document.entries.map((entry) => entry.id), ["valid-release"]);
});

test("all announcements expire after seven days, with future dates hidden", () => {
  const entries = parseNewFeaturesDocument(`---
entries:
  - id: upcoming
    kind: improved
    category: experience
    status: upcoming
    targetVersion: Next release
    publishedAt: "2026-09-09T00:00:00Z"
    sourceUrl: https://github.com/NabiCook/PaladinsCat/discussions/1
    title: Upcoming
    summary: Visible before release.
  - id: current
    kind: fixed
    category: analytics
    status: released
    targetVersion: v1.2.3
    publishedAt: "2026-09-08T00:00:00Z"
    sourceUrl: https://github.com/NabiCook/PaladinsCat/releases/tag/v1.2.3
    title: Current
    summary: Still inside the window.
  - id: expired
    kind: fixed
    category: analytics
    status: released
    targetVersion: v1.2.2
    publishedAt: "2026-09-01T00:00:00Z"
    sourceUrl: https://github.com/NabiCook/PaladinsCat/blob/main/docs/features/expired.md
    title: Expired
    summary: Outside the window.
---`).entries;
  assert.deepEqual(activeNewFeatures(entries, new Date("2026-09-10T00:00:00Z")).map((entry) => entry.id), ["upcoming", "current"]);
  assert.deepEqual(activeNewFeatures(entries, new Date("2026-09-08T00:00:00Z")).map((entry) => entry.id), ["current"]);
  assert.deepEqual(activeNewFeatures(entries, new Date("2026-09-15T00:00:00Z")).map((entry) => entry.id), ["upcoming"]);
  assert.equal(activeNewFeatures(entries, new Date("2026-09-15T23:59:59.999Z")).length, 1);
  assert.deepEqual(activeNewFeatures(entries, new Date("2026-09-16T00:00:00Z")), []);
});

test("requires an actual GitHub source and UTC publication date for every status", () => {
  const entry = `---
entries:
  - id: announcement
    kind: new
    category: stats
    status: upcoming
    targetVersion: Next release
    publishedAt: "2026-09-09T00:00:00Z"
    sourceUrl: https://github.com/NabiCook/PaladinsCat/discussions/1
    title: Announcement
    summary: A customer-facing announcement.
---`;
  assert.equal(parseNewFeaturesDocument(entry).entries.length, 1);
  for (const status of ["upcoming", "released"]) {
    const content = entry.replace("status: upcoming", `status: ${status}`);
    assert.deepEqual(parseNewFeaturesDocument(content.replace(/    publishedAt:.*\n/, "")).entries, []);
    assert.deepEqual(parseNewFeaturesDocument(content.replace(/    sourceUrl:.*\n/, "")).entries, []);
    assert.deepEqual(parseNewFeaturesDocument(content.replace("github.com/", "github.com.example/")).entries, []);
    assert.deepEqual(parseNewFeaturesDocument(content.replace("2026-09-09T00:00:00Z", "not-a-date")).entries, []);
  }
});
