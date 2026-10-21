import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { countUnreadNotifications, getNotificationHref, markAllNotificationsReadInList, markNotificationReadInList, maxVisibleNotifications, notificationTypes, type NotificationItem } from "../src/lib/notifications/types";

const baseItem: NotificationItem = {
  id: "10000000-0000-4000-8000-000000000001",
  type: "generation_completed",
  projectId: "20000000-0000-4000-8000-000000000002",
  generationId: "30000000-0000-4000-8000-000000000003",
  projectName: "Roman",
  isRead: false,
  createdAt: "2026-10-07T10:00:00.000Z",
};

test("V1 supports the four final generation and image-edit events", () => {
  assert.deepEqual(notificationTypes, ["generation_completed", "generation_failed", "image_edit_completed", "image_edit_failed"]);
});

test("notification panel is limited to the five most recent items", () => {
  assert.equal(maxVisibleNotifications, 5);
  const source = readFileSync("src/lib/notifications/get-notifications.ts", "utf8");
  assert.match(source, /\.order\("created_at", \{ ascending: false \}\)[\s\S]*\.limit\(maxVisibleNotifications\)/);
});

test("unread notifications are counted and local read state is deterministic", () => {
  const items = [baseItem, { ...baseItem, id: "second", isRead: true }];
  assert.equal(countUnreadNotifications(items), 1);
  assert.equal(countUnreadNotifications(markNotificationReadInList(items, baseItem.id)), 0);
  assert.equal(countUnreadNotifications(markAllNotificationsReadInList(items)), 0);
});

test("notification navigation uses the existing generation query when available", () => {
  assert.equal(getNotificationHref("tr", baseItem), `/tr/dashboard/projects/${baseItem.projectId}?generation=${baseItem.generationId}`);
  assert.equal(getNotificationHref("en", { projectId: baseItem.projectId, generationId: null }), `/en/dashboard/projects/${baseItem.projectId}`);
});

test("migration restricts browser access and deduplicates each user event", () => {
  const migration = readFileSync("database/migrations/20261007000000_create_notifications.sql", "utf8");
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /grant select on table public\.notifications to authenticated/i);
  assert.match(migration, /grant update \(is_read\) on table public\.notifications to authenticated/i);
  assert.doesNotMatch(migration, /grant[^;]*insert[^;]*to authenticated/i);
  assert.match(migration, /unique \(user_id, event_key\)/i);
});

test("generation and image-edit final states create all four notification variants", () => {
  const source = readFileSync("src/lib/generation/image-worker-service.ts", "utf8");
  for (const type of notificationTypes) assert.match(source, new RegExp(`type: [\"']${type}[\"']`));
});

test("TR and EN notification copy and compact empty states exist", () => {
  for (const locale of ["tr", "en"]) {
    const messages = JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8"));
    assert.ok(messages.Dashboard.notifications.emptyTitle);
    assert.ok(messages.Dashboard.notifications.emptyDescription);
    for (const type of notificationTypes) {
      assert.ok(messages.Dashboard.notifications[type].title);
      assert.ok(messages.Dashboard.notifications[type].message);
    }
  }
});
