import assert from "node:assert/strict";
import test from "node:test";
import { parseJSONLoose } from "../lib/openai";

test("parseJSONLoose extracts the first balanced JSON object from prose", () => {
  const parsed = parseJSONLoose<{ ranked: Array<{ agent_id: string }> }>(
    'Here you go:\n{"ranked":[{"agent_id":"github-engineering"}]}\nextra text',
  );
  assert.equal(parsed.ranked[0].agent_id, "github-engineering");
});

test("parseJSONLoose extracts root arrays as well as objects", () => {
  const parsed = parseJSONLoose<Array<{ ok: boolean }>>(
    '```json\n[{"ok":true}]\n```',
  );
  assert.equal(parsed[0].ok, true);
});
