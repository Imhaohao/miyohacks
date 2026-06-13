/**
 * Dependency-free local text embedding for the router benchmark.
 *
 * Hashing vectorizer: word tokens + character trigrams hashed into a fixed-dim
 * vector with term-frequency weighting, then L2-normalized. Cosine over these is
 * a legitimate, reproducible "vector search" baseline that needs no API key and
 * is fully deterministic — exactly what a benchmark wants.
 *
 * The council named "vector search over tool descriptions" as the baseline the
 * real router must beat. This is that baseline, kept free + offline so the
 * benchmark runs in CI with zero secrets.
 *
 * v2 upgrade path: swap `embed()` for an OpenAI / sentence-transformers embedder
 * behind an env flag without touching callers — same `Vec` shape + `cosine()`.
 */

const DIM = 2048;

export type Vec = Float64Array;

/** FNV-1a 32-bit hash → bucket in [0, DIM). */
function hashToken(token: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % DIM;
}

function features(text: string): string[] {
  const lower = text.toLowerCase();
  const words = lower.split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  const out: string[] = [...words];
  // Character trigrams capture partial overlap ("stripe" ~ "stripes", "payout").
  for (const w of words) {
    const padded = `#${w}#`;
    for (let i = 0; i + 3 <= padded.length; i++) {
      out.push(`_${padded.slice(i, i + 3)}`);
    }
  }
  return out;
}

export function embed(text: string): Vec {
  const v = new Float64Array(DIM);
  for (const f of features(text)) {
    v[hashToken(f)] += 1;
  }
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i++) v[i] /= norm;
  return v;
}

/** Cosine similarity. Inputs are assumed L2-normalized (as `embed` returns). */
export function cosine(a: Vec, b: Vec): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}
