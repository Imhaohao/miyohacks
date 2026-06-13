export const EMBEDDING_DIM = 1536;

// --- local hashing embedder (ported from eval/router-bench/embed.ts, DIM=1536, returns number[]) ---

function hashToken(token: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % EMBEDDING_DIM;
}

function features(text: string): string[] {
  const lower = text.toLowerCase();
  const words = lower.split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  const out: string[] = [...words];
  for (const w of words) {
    const padded = `#${w}#`;
    for (let i = 0; i + 3 <= padded.length; i++) {
      out.push(`_${padded.slice(i, i + 3)}`);
    }
  }
  return out;
}

function localEmbed(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIM).fill(0);
  for (const f of features(text)) {
    v[hashToken(f)] += 1;
  }
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < EMBEDDING_DIM; i++) v[i] /= norm;
  return v;
}

// --- OpenAI embedder ---

async function openAIEmbed(texts: string[]): Promise<number[][]> {
  const key = process.env.OPENAI_API_KEY!;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await Promise.race([
      fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: texts,
          dimensions: 1536,
        }),
        signal: controller.signal,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("openai embed: 15s timeout")), 15_000),
      ),
    ]);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const snippet = (await res.text()).slice(0, 300);
    throw new Error(`openai embed ${res.status}: ${snippet}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

// --- public API ---

export function embeddingBackend(): "openai" | "local-hash" {
  if (
    process.env.OPENAI_API_KEY &&
    process.env.HIVE_EMBEDDINGS_FORCE_LOCAL !== "true"
  ) {
    return "openai";
  }
  return "local-hash";
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const inputs = texts.map((t) => t.trim().slice(0, 8000));
  if (embeddingBackend() === "openai") {
    try {
      return await openAIEmbed(inputs);
    } catch (err) {
      console.warn(`embedTexts: openai failed, falling back to local-hash: ${(err as Error).message}`);
    }
  }
  return inputs.map(localEmbed);
}

export async function embedText(text: string): Promise<number[]> {
  return (await embedTexts([text]))[0];
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}
