/**
 * Tiny markdown-ish renderer: splits text on ``` fenced code blocks and
 * renders alternating prose / code segments. Sufficient for showing
 * specialist outputs without pulling in a markdown dep.
 */
export function MarkdownLite({ text }: { text: string }) {
  const segments = splitFences(text);
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {segments.map((seg, i) =>
        seg.kind === "code" ? (
          <pre
            key={i}
            className="overflow-x-auto rounded-xl border border-line bg-surface-subtle p-3 font-mono text-xs text-ink-soft"
          >
            {seg.lang && (
              <div className="mb-1 text-[10px] font-medium text-ink-muted">
                {seg.lang}
              </div>
            )}
            <code>{seg.body}</code>
          </pre>
        ) : (
          <div
            key={i}
            className="whitespace-pre-wrap font-sans text-ink-soft"
          >
            {seg.body}
          </div>
        ),
      )}
    </div>
  );
}

interface Segment {
  kind: "prose" | "code";
  body: string;
  lang?: string;
}

function splitFences(text: string): Segment[] {
  const out: Segment[] = [];
  const re = /```(\w+)?\n([\s\S]*?)```/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) {
      out.push({ kind: "prose", body: text.slice(lastIdx, m.index).trim() });
    }
    out.push({ kind: "code", lang: m[1], body: m[2].trimEnd() });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    const tail = text.slice(lastIdx).trim();
    if (tail) out.push({ kind: "prose", body: tail });
  }
  return out.filter((s) => s.body.length > 0);
}
