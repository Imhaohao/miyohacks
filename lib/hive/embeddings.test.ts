import assert from "node:assert/strict";
import { EMBEDDING_DIM, embedText, cosineSimilarity, embeddingBackend } from "./embeddings";

process.env.HIVE_EMBEDDINGS_FORCE_LOCAL = "true";
delete process.env.OPENAI_API_KEY;

async function main(): Promise<void> {
  assert.equal(embeddingBackend(), "local-hash");

  const v1 = await embedText("stripe payments");
  assert.equal(v1.length, EMBEDDING_DIM, "vector length must be 1536");

  const v1b = await embedText("stripe payments");
  assert.deepEqual(v1, v1b, "same input must produce same vector");

  let norm = 0;
  for (const x of v1) norm += x * x;
  assert(
    Math.abs(Math.sqrt(norm) - 1) < 1e-6,
    `unit-norm check failed: norm=${Math.sqrt(norm)}`,
  );

  const vPayouts = await embedText("stripe payouts");
  const vKubernetes = await embedText("kubernetes scheduling");

  const simRelated = cosineSimilarity(v1, vPayouts);
  const simUnrelated = cosineSimilarity(v1, vKubernetes);

  assert(
    simRelated > simUnrelated,
    `expected sim("stripe payments","stripe payouts")=${simRelated} > sim("stripe payments","kubernetes scheduling")=${simUnrelated}`,
  );

  console.log("embeddings tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
