import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const sql=readFileSync("database/migrations/20261031030000_harden_model_candidate_integrity.sql","utf8");
test("hardening limits approval to the trusted transaction and candidate idempotency",()=>{assert.match(sql,/app\.model_approval/);assert.match(sql,/approved_candidate_id/);assert.match(sql,/Another candidate is already approved/);assert.match(sql,/submission_state='persisted'/);});
test("hardening fences owner relationships and lease renewal",()=>{assert.match(sql,/Candidate job ownership mismatch/);assert.match(sql,/Identity reference ownership mismatch/);assert.match(sql,/renew_model_candidate_lease/);});
