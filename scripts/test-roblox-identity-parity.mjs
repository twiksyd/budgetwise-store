// Fixture tests for the Roblox identity parity comparison
// (scripts/lib/roblox-identity-parity.mjs). No network or database access.
//
// Run with: node --test scripts/test-roblox-identity-parity.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TRUSTED_MAPPINGS_PATH,
  compareIdentityParity,
  parseTrustedMappings,
} from "./lib/roblox-identity-parity.mjs";

const GAME_A = "aaaaaaaa-0000-4000-8000-000000000001";
const GAME_B = "aaaaaaaa-0000-4000-8000-000000000002";
const GAME_C = "aaaaaaaa-0000-4000-8000-000000000003";

const trusted = parseTrustedMappings(JSON.stringify({ [GAME_A]: 10648820673, [GAME_B]: 88070565 }));

test("current trusted config parses with 26 unique mappings", () => {
  const mappings = parseTrustedMappings(readFileSync(TRUSTED_MAPPINGS_PATH, "utf8"));
  assert.equal(mappings.size, 26);
  assert.equal(new Set(mappings.values()).size, 26);
});

test("exact match is parity, with string or numeric universe ids", () => {
  const result = compareIdentityParity(trusted, [
    { game_id: GAME_A, universe_id: "10648820673" },
    { game_id: GAME_B, universe_id: 88070565 },
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual([result.missing_in_db, result.extra_in_db, result.universe_id_mismatch], [[], [], []]);
});

test("reports missing, extra, and mismatched identities together", () => {
  const result = compareIdentityParity(trusted, [
    { game_id: GAME_A, universe_id: "10648820674" },
    { game_id: GAME_C, universe_id: "5" },
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing_in_db, [{ game_id: GAME_B, json_universe_id: "88070565" }]);
  assert.deepEqual(result.extra_in_db, [{ game_id: GAME_C, db_universe_id: "5" }]);
  assert.deepEqual(result.universe_id_mismatch, [
    { game_id: GAME_A, json_universe_id: "10648820673", db_universe_id: "10648820674" },
  ]);
});

test("an empty database fails parity with every mapping missing", () => {
  const result = compareIdentityParity(trusted, []);
  assert.equal(result.ok, false);
  assert.equal(result.missing_in_db.length, 2);
});

test("rejects ambiguous trusted config", () => {
  assert.throws(() => parseTrustedMappings(`{"${GAME_A}": 1, "${GAME_A}": 2}`), /duplicate game id/);
  assert.throws(() => parseTrustedMappings(JSON.stringify({ [GAME_A]: 7, [GAME_B]: 7 })), /mapped to both/);
  assert.throws(() => parseTrustedMappings(JSON.stringify({ "not-a-uuid": 7 })), /not a lowercase UUID/);
  assert.throws(() => parseTrustedMappings(JSON.stringify({ [GAME_A]: 0 })), /positive safe integer/);
  assert.throws(() => parseTrustedMappings("[]"), /JSON object/);
});

test("rejects malformed database rows instead of guessing", () => {
  assert.throws(() => compareIdentityParity(trusted, [{ game_id: GAME_A, universe_id: "-1" }]), /positive integer/);
  assert.throws(() => compareIdentityParity(trusted, [{ game_id: GAME_A, universe_id: 2 ** 60 }]), /positive integer/);
  assert.throws(
    () => compareIdentityParity(trusted, [
      { game_id: GAME_A, universe_id: "1" },
      { game_id: GAME_A, universe_id: "1" },
    ]),
    /more than once/,
  );
});
