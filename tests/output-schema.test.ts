import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  appendOutputSchemaInstructions,
  formatOutputSchemaValidationError,
  validateJsonSchemaValue,
  validateOutputAgainstSchema,
} from "../lib/output-schema";

test("output schema accepts a matching structured artifact", () => {
  const schema = {
    type: "object",
    required: ["title", "score"],
    additionalProperties: false,
    properties: {
      title: { type: "string", minLength: 3 },
      score: { type: "integer", minimum: 0, maximum: 10 },
    },
  };

  const result = validateOutputAgainstSchema(
    {
      text: "Human-readable summary.",
      artifact: { title: "Launch plan", score: 8 },
    },
    schema,
  );

  assert.equal(result.ok, true);
  assert.equal(result.candidate, "artifact");
});

test("output schema accepts JSON embedded in text", () => {
  const schema = {
    type: "object",
    required: ["creators"],
    properties: {
      creators: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["handle"],
          properties: { handle: { type: "string", pattern: "^@" } },
        },
      },
    },
  };

  const result = validateOutputAgainstSchema(
    {
      text: '```json\n{"creators":[{"handle":"@hydrationhaley"}]}\n```',
    },
    schema,
  );

  assert.equal(result.ok, true);
  assert.equal(result.candidate, "text_json");
});

test("output schema rejects missing required fields with a clear path", () => {
  const result = validateOutputAgainstSchema(
    {
      text: '{"summary":"No title here"}',
    },
    {
      type: "object",
      required: ["title"],
      properties: { title: { type: "string" } },
    },
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /\$\.title: required property missing/);
  assert.match(formatOutputSchemaValidationError(result), /output_schema validation failed/);
});

test("output schema rejects disallowed additional properties", () => {
  const errors = validateJsonSchemaValue(
    { title: "Done", extra: true },
    {
      type: "object",
      additionalProperties: false,
      properties: { title: { type: "string" } },
    },
  );

  assert.ok(errors.some((error) => error.includes("$.extra: additional property not allowed")));
});

test("output schema is optional and execution prompts include it when present", () => {
  assert.deepEqual(
    validateOutputAgainstSchema({ text: "anything" }, undefined),
    { ok: true, candidate: "none" },
  );

  const prompt = appendOutputSchemaInstructions("Do the work.", {
    type: "object",
    required: ["answer"],
  });

  assert.match(prompt, /Required output schema/);
  assert.match(prompt, /"answer"/);
  assert.match(prompt, /Return a final result that conforms/);
});

test("auction execution validates output_schema before judging or settlement", () => {
  const auctions = readFileSync("convex/auctions.ts", "utf8");
  const types = readFileSync("lib/types.ts", "utf8");
  const executeStart = auctions.indexOf("export const execute");
  const normalized = auctions.indexOf("const normalized = normalizeSpecialistOutput", executeStart);
  const validation = auctions.indexOf(
    "const schemaValidation = validateOutputAgainstSchema",
    executeStart,
  );
  const failureEvent = auctions.indexOf("output_schema_validation_failed", executeStart);
  const setResult = auctions.indexOf("internal.tasks._setResult", executeStart);
  const scheduleJudge = auctions.indexOf("internal.auctions.judge", executeStart);
  const settleStart = auctions.indexOf("export const settle");

  assert.ok(executeStart > 0);
  assert.ok(normalized > executeStart);
  assert.ok(validation > normalized);
  assert.ok(failureEvent > validation);
  assert.ok(setResult > validation);
  assert.ok(scheduleJudge > setResult);
  assert.ok(settleStart > scheduleJudge);
  assert.match(types, /"output_schema_validation_failed"/);
});
