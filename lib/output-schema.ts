import { parseJSONLoose } from "./openai";

export type OutputSchemaCandidate = "artifact" | "text_json" | "text";

export interface NormalizedOutputForSchema {
  text: string;
  artifact?: unknown;
}

export interface OutputSchemaValidationSuccess {
  ok: true;
  candidate: OutputSchemaCandidate | "none";
}

export interface OutputSchemaValidationFailure {
  ok: false;
  candidate: OutputSchemaCandidate;
  errors: string[];
  candidate_errors: Array<{
    candidate: OutputSchemaCandidate;
    errors: string[];
  }>;
}

export type OutputSchemaValidationResult =
  | OutputSchemaValidationSuccess
  | OutputSchemaValidationFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isRecord(a) && isRecord(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return (
      aKeys.length === bKeys.length &&
      aKeys.every((key) =>
        Object.prototype.hasOwnProperty.call(b, key) &&
        deepEqual(a[key], b[key]),
      )
    );
  }
  return false;
}

function displayType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number" && Number.isInteger(value)) return "integer";
  return typeof value;
}

function jsonSchemaTypes(schema: Record<string, unknown>): string[] | null {
  const raw = schema.type;
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) {
    const types = raw.filter((item): item is string => typeof item === "string");
    return types.length > 0 ? Array.from(new Set(types)) : null;
  }
  return null;
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "array":
      return Array.isArray(value);
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "null":
      return value === null;
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "object":
      return isRecord(value);
    case "string":
      return typeof value === "string";
    default:
      return false;
  }
}

function pathFor(parent: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key)
    ? `${parent}.${key}`
    : `${parent}[${JSON.stringify(key)}]`;
}

function validateArrayKeyword(
  value: unknown,
  schema: Record<string, unknown>,
  path: string,
): string[] {
  const errors: string[] = [];
  const hasArrayKeywords =
    "items" in schema || "minItems" in schema || "maxItems" in schema;
  if (!hasArrayKeywords) return errors;
  if (!Array.isArray(value)) {
    return [`${path}: expected array for array schema keywords, got ${displayType(value)}`];
  }

  if (typeof schema.minItems === "number" && value.length < schema.minItems) {
    errors.push(`${path}: expected at least ${schema.minItems} item(s), got ${value.length}`);
  }
  if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
    errors.push(`${path}: expected at most ${schema.maxItems} item(s), got ${value.length}`);
  }

  if (isRecord(schema.items)) {
    value.forEach((item, i) => {
      errors.push(...validateJsonSchemaValue(item, schema.items, `${path}[${i}]`));
    });
  } else if (Array.isArray(schema.items)) {
    schema.items.forEach((itemSchema, i) => {
      if (i < value.length && isRecord(itemSchema)) {
        errors.push(...validateJsonSchemaValue(value[i], itemSchema, `${path}[${i}]`));
      }
    });
  }
  return errors;
}

function validateNumberKeyword(
  value: unknown,
  schema: Record<string, unknown>,
  path: string,
): string[] {
  if (typeof value !== "number" || !Number.isFinite(value)) return [];
  const errors: string[] = [];
  if (typeof schema.minimum === "number" && value < schema.minimum) {
    errors.push(`${path}: expected >= ${schema.minimum}, got ${value}`);
  }
  if (typeof schema.maximum === "number" && value > schema.maximum) {
    errors.push(`${path}: expected <= ${schema.maximum}, got ${value}`);
  }
  if (
    typeof schema.exclusiveMinimum === "number" &&
    value <= schema.exclusiveMinimum
  ) {
    errors.push(`${path}: expected > ${schema.exclusiveMinimum}, got ${value}`);
  }
  if (
    typeof schema.exclusiveMaximum === "number" &&
    value >= schema.exclusiveMaximum
  ) {
    errors.push(`${path}: expected < ${schema.exclusiveMaximum}, got ${value}`);
  }
  return errors;
}

function validateStringKeyword(
  value: unknown,
  schema: Record<string, unknown>,
  path: string,
): string[] {
  if (typeof value !== "string") return [];
  const errors: string[] = [];
  if (typeof schema.minLength === "number" && value.length < schema.minLength) {
    errors.push(`${path}: expected length >= ${schema.minLength}, got ${value.length}`);
  }
  if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
    errors.push(`${path}: expected length <= ${schema.maxLength}, got ${value.length}`);
  }
  if (typeof schema.pattern === "string") {
    try {
      if (!new RegExp(schema.pattern).test(value)) {
        errors.push(`${path}: expected to match pattern ${schema.pattern}`);
      }
    } catch {
      errors.push(`${path}: invalid schema pattern ${schema.pattern}`);
    }
  }
  return errors;
}

function validateObjectKeyword(
  value: unknown,
  schema: Record<string, unknown>,
  path: string,
): string[] {
  const errors: string[] = [];
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const hasObjectKeywords =
    Object.keys(properties).length > 0 ||
    Array.isArray(schema.required) ||
    "additionalProperties" in schema ||
    "minProperties" in schema ||
    "maxProperties" in schema;
  if (!hasObjectKeywords) return errors;
  if (!isRecord(value)) {
    return [`${path}: expected object for object schema keywords, got ${displayType(value)}`];
  }

  const required = Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === "string")
    : [];
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      errors.push(`${pathFor(path, key)}: required property missing`);
    }
  }

  if (typeof schema.minProperties === "number" && Object.keys(value).length < schema.minProperties) {
    errors.push(
      `${path}: expected at least ${schema.minProperties} propertie(s), got ${Object.keys(value).length}`,
    );
  }
  if (typeof schema.maxProperties === "number" && Object.keys(value).length > schema.maxProperties) {
    errors.push(
      `${path}: expected at most ${schema.maxProperties} propertie(s), got ${Object.keys(value).length}`,
    );
  }

  for (const [key, propertySchema] of Object.entries(properties)) {
    if (
      Object.prototype.hasOwnProperty.call(value, key) &&
      isRecord(propertySchema)
    ) {
      errors.push(...validateJsonSchemaValue(value[key], propertySchema, pathFor(path, key)));
    }
  }

  const additional = schema.additionalProperties;
  const knownKeys = new Set(Object.keys(properties));
  for (const key of Object.keys(value)) {
    if (knownKeys.has(key)) continue;
    if (additional === false) {
      errors.push(`${pathFor(path, key)}: additional property not allowed`);
    } else if (isRecord(additional)) {
      errors.push(...validateJsonSchemaValue(value[key], additional, pathFor(path, key)));
    }
  }
  return errors;
}

function validateCombinators(
  value: unknown,
  schema: Record<string, unknown>,
  path: string,
): string[] {
  const errors: string[] = [];
  if (Array.isArray(schema.allOf)) {
    for (const subSchema of schema.allOf) {
      if (isRecord(subSchema)) {
        errors.push(...validateJsonSchemaValue(value, subSchema, path));
      }
    }
  }
  if (Array.isArray(schema.anyOf)) {
    const matches = schema.anyOf.filter(
      (subSchema) =>
        isRecord(subSchema) &&
        validateJsonSchemaValue(value, subSchema, path).length === 0,
    );
    if (matches.length === 0) {
      errors.push(`${path}: expected to satisfy at least one anyOf schema`);
    }
  }
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter(
      (subSchema) =>
        isRecord(subSchema) &&
        validateJsonSchemaValue(value, subSchema, path).length === 0,
    );
    if (matches.length !== 1) {
      errors.push(`${path}: expected to satisfy exactly one oneOf schema, matched ${matches.length}`);
    }
  }
  return errors;
}

export function validateJsonSchemaValue(
  value: unknown,
  schema: unknown,
  path = "$",
): string[] {
  if (!isRecord(schema)) return [`${path}: output_schema must be a JSON Schema object`];

  const errors: string[] = [];
  const types = jsonSchemaTypes(schema);
  if (types && !types.some((type) => matchesType(value, type))) {
    return [
      `${path}: expected type ${types.join(" | ")}, got ${displayType(value)}`,
    ];
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((item) => deepEqual(item, value))) {
    errors.push(`${path}: expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}`);
  }
  if ("const" in schema && !deepEqual(schema.const, value)) {
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }

  errors.push(...validateCombinators(value, schema, path));
  errors.push(...validateObjectKeyword(value, schema, path));
  errors.push(...validateArrayKeyword(value, schema, path));
  errors.push(...validateNumberKeyword(value, schema, path));
  errors.push(...validateStringKeyword(value, schema, path));
  return errors;
}

function outputCandidates(output: NormalizedOutputForSchema): Array<{
  candidate: OutputSchemaCandidate;
  value: unknown;
}> {
  const candidates: Array<{ candidate: OutputSchemaCandidate; value: unknown }> = [];
  if (output.artifact !== undefined) {
    candidates.push({ candidate: "artifact", value: output.artifact });
  }
  try {
    candidates.push({
      candidate: "text_json",
      value: parseJSONLoose<unknown>(output.text),
    });
  } catch {
    // Plain markdown/text output is still a valid candidate for string schemas.
  }
  candidates.push({ candidate: "text", value: output.text });
  return candidates;
}

export function validateOutputAgainstSchema(
  output: NormalizedOutputForSchema,
  schema: unknown,
): OutputSchemaValidationResult {
  if (schema === undefined || schema === null) {
    return { ok: true, candidate: "none" };
  }

  const candidateErrors = outputCandidates(output).map((candidate) => ({
    candidate: candidate.candidate,
    errors: validateJsonSchemaValue(candidate.value, schema),
  }));
  const passing = candidateErrors.find((candidate) => candidate.errors.length === 0);
  if (passing) return { ok: true, candidate: passing.candidate };

  const best =
    candidateErrors
      .slice()
      .sort((a, b) => a.errors.length - b.errors.length)[0] ?? {
      candidate: "text" as const,
      errors: ["$: no output candidates available"],
    };
  return {
    ok: false,
    candidate: best.candidate,
    errors: best.errors,
    candidate_errors: candidateErrors,
  };
}

export function formatOutputSchemaValidationError(
  result: OutputSchemaValidationFailure,
): string {
  return `output_schema validation failed (${result.candidate}): ${result.errors
    .slice(0, 5)
    .join("; ")}`;
}

export function appendOutputSchemaInstructions(
  prompt: string,
  outputSchema: unknown,
): string {
  if (outputSchema === undefined || outputSchema === null) return prompt;
  return [
    prompt,
    "Required output schema:",
    JSON.stringify(outputSchema, null, 2),
    "Return a final result that conforms to this schema. If you cannot safely satisfy the schema, say so explicitly instead of inventing fields.",
  ].join("\n\n---\n\n");
}
