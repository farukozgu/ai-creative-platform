import assert from "node:assert/strict";
import test from "node:test";
import { createImageEditRequestFingerprint, isImageEditExecutionEnabled, validateImageEditSubmissionId } from "../src/lib/generation/image-edit-admission-contract";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const project = "33333333-3333-4333-8333-333333333333";
const base = "44444444-4444-4444-8444-444444444444";
const keyA = "55555555-5555-4555-8555-555555555555";
const keyB = "66666666-6666-4666-4666-666666666666";
type State = "admitted" | "possibly_submitted" | "output_persisted" | "failed_pre_provider" | "reconciliation_required";
type Entry = { owner: string; fingerprint: string; state: State; generationId: string | null };

/** Deterministic mock of the owner-serialized RPC transaction, not PostgreSQL integration. */
class AtomicAdmissionHarness {
  private records = new Map<string, Entry>();
  constructor(private readonly limit = 2) {}
  admit(owner: string, key: string, value: string) {
    const identity = owner + ":" + key;
    const existing = this.records.get(identity);
    if (existing) {
      if (existing.fingerprint !== value) return "payload_conflict";
      if (existing.state === "failed_pre_provider") { existing.state = "admitted"; return "admitted"; }
      return existing.state === "output_persisted" ? "replay_success" : "replay_active";
    }
    const active = [...this.records.values()].filter((record) => record.owner === owner && ["admitted", "possibly_submitted", "reconciliation_required"].includes(record.state)).length;
    if (active >= this.limit) return "capacity";
    this.records.set(identity, { owner, fingerprint: value, state: "admitted", generationId: null });
    return "admitted";
  }
  transition(owner: string, key: string, state: State, generationId: string | null = null) {
    const record = this.records.get(owner + ":" + key);
    assert.ok(record);
    record.state = state; record.generationId = generationId;
  }
}

const fingerprint = (instruction: string) => createImageEditRequestFingerprint({ projectId: project, baseGenerationId: base, instruction });

test("image edit feature gate is disabled by default and uses its own flag", () => {
  assert.equal(isImageEditExecutionEnabled({}), false);
  assert.equal(isImageEditExecutionEnabled({ IMAGE_EDIT_EXECUTION_ENABLED: "true" }), true);
});
test("submission IDs are UUID-bound and fingerprints bind normalized paid payloads", () => {
  assert.equal(validateImageEditSubmissionId(keyA), true); assert.equal(validateImageEditSubmissionId("not-a-key"), false);
  assert.equal(fingerprint(" change background "), fingerprint("change background")); assert.notEqual(fingerprint("change background"), fingerprint("change lighting"));
});
test("two concurrent identical submissions result in one admission and one active replay", async () => {
  const store = new AtomicAdmissionHarness();
  const results = await Promise.all([Promise.resolve().then(() => store.admit(ownerA, keyA, fingerprint("change background"))), Promise.resolve().then(() => store.admit(ownerA, keyA, fingerprint("change background")))]);
  assert.deepEqual(results.sort(), ["admitted", "replay_active"]);
});
test("different payload with the same key is rejected and owners cannot collide", () => {
  const store = new AtomicAdmissionHarness();
  assert.equal(store.admit(ownerA, keyA, fingerprint("change background")), "admitted");
  assert.equal(store.admit(ownerA, keyA, fingerprint("change lighting")), "payload_conflict");
  assert.equal(store.admit(ownerB, keyA, fingerprint("change lighting")), "admitted");
});
test("distinct concurrent keys obey capacity while terminal output releases it", () => {
  const store = new AtomicAdmissionHarness(2);
  assert.equal(store.admit(ownerA, keyA, fingerprint("one")), "admitted"); assert.equal(store.admit(ownerA, keyB, fingerprint("two")), "admitted");
  assert.equal(store.admit(ownerA, "77777777-7777-4777-8777-777777777777", fingerprint("three")), "capacity");
  store.transition(ownerA, keyA, "output_persisted", "generation-1");
  assert.equal(store.admit(ownerA, "77777777-7777-4777-8777-777777777777", fingerprint("three")), "admitted");
  assert.equal(store.admit(ownerA, keyA, fingerprint("one")), "replay_success");
});
test("safe pre-provider failure permits retry; ambiguous submission remains blocked", () => {
  const store = new AtomicAdmissionHarness();
  assert.equal(store.admit(ownerA, keyA, fingerprint("one")), "admitted"); store.transition(ownerA, keyA, "failed_pre_provider");
  assert.equal(store.admit(ownerA, keyA, fingerprint("one")), "admitted"); store.transition(ownerA, keyA, "possibly_submitted");
  assert.equal(store.admit(ownerA, keyA, fingerprint("one")), "replay_active"); store.transition(ownerA, keyA, "reconciliation_required");
  assert.equal(store.admit(ownerA, keyA, fingerprint("one")), "replay_active");
});
