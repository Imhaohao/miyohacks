import { createServer, type IncomingMessage } from "node:http";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: {
    message?: { parts?: Array<{ kind?: string; text?: string }> };
    metadata?: Record<string, unknown>;
  };
};

type JiraAction =
  | "jira.create_issue"
  | "jira.get_issue"
  | "jira.search_issues"
  | "jira.add_comment"
  | "jira.transition_issue";

type JiraMessage = {
  id?: string;
  capability: JiraAction;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type JiraToken = { access_token: string; expires_at: number };

const PORT = Number(process.env.JIRA_AGENT_PORT ?? "4001");
const BASE_URL = process.env.JIRA_BASE_URL;
const OAUTH_CLIENT_ID = process.env.JIRA_OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.JIRA_OAUTH_CLIENT_SECRET;
const OAUTH_REFRESH_TOKEN = process.env.JIRA_OAUTH_REFRESH_TOKEN;
const OAUTH_CLOUD_ID = process.env.JIRA_OAUTH_CLOUD_ID;
const STATIC_ACCESS_TOKEN = process.env.JIRA_OAUTH_ACCESS_TOKEN;
const IDPOTENCY_FILE =
  process.env.JIRA_AGENT_IDEMPOTENCY_FILE ?? ".jira-agent-idempotency.json";
const ALLOWED_PROJECTS = new Set(
  (process.env.JIRA_ALLOWED_PROJECTS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean),
);

let cachedToken: JiraToken | null = null;
let idempotency = new Map<string, unknown>();

async function loadIdempotency() {
  try {
    const raw = await fs.readFile(IDPOTENCY_FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    idempotency = new Map(Object.entries(parsed));
  } catch {
    idempotency = new Map();
  }
}

async function saveIdempotency() {
  const payload = Object.fromEntries(idempotency.entries());
  await fs.writeFile(IDPOTENCY_FILE, JSON.stringify(payload, null, 2), "utf8");
}

function parsePromptBody(req: JsonRpcRequest): JiraMessage {
  const params = req.params ?? {};
  const message = params.message?.parts
    ?.map((part) => part.text)
    .filter((t): t is string => Boolean(t))
    .join("\n");
  if (!message) throw new Error("message.parts text is required");
  const parsed = JSON.parse(message) as JiraMessage;
  if (!parsed.capability) throw new Error("capability is required");
  if (!parsed.payload || typeof parsed.payload !== "object") {
    throw new Error("payload object is required");
  }
  return parsed;
}

function ensureAllowedProject(projectKey: unknown) {
  if (typeof projectKey !== "string" || !projectKey.trim()) {
    throw new Error("projectKey is required");
  }
  if (ALLOWED_PROJECTS.size > 0 && !ALLOWED_PROJECTS.has(projectKey)) {
    throw new Error(`project ${projectKey} is not in the allowlist`);
  }
}

function approvalRequiredForAction(message: JiraMessage): boolean {
  if (message.capability !== "jira.transition_issue") return false;
  const transitionName = String(message.payload.transitionName ?? "").toLowerCase();
  return (
    transitionName.includes("done") ||
    transitionName.includes("closed") ||
    transitionName.includes("resolved")
  );
}

function assertApproved(message: JiraMessage) {
  if (!approvalRequiredForAction(message)) return;
  const approved = message.metadata?.approved === true;
  if (!approved) {
    throw new Error(
      "approval is required for done/closed/resolved transitions; set metadata.approved=true",
    );
  }
}

async function jiraAccessToken(): Promise<string> {
  if (STATIC_ACCESS_TOKEN) return STATIC_ACCESS_TOKEN;
  if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET || !OAUTH_REFRESH_TOKEN) {
    throw new Error("JIRA OAuth is not fully configured");
  }
  const now = Date.now();
  if (cachedToken && cachedToken.expires_at > now + 30_000) {
    return cachedToken.access_token;
  }
  const res = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      refresh_token: OAUTH_REFRESH_TOKEN,
    }),
  });
  if (!res.ok) {
    throw new Error(`oauth refresh failed (${res.status})`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    access_token: data.access_token,
    expires_at: now + data.expires_in * 1000,
  };
  return data.access_token;
}

function jiraApiBase() {
  if (OAUTH_CLOUD_ID) {
    return `https://api.atlassian.com/ex/jira/${OAUTH_CLOUD_ID}/rest/api/3`;
  }
  if (!BASE_URL) throw new Error("JIRA_BASE_URL or JIRA_OAUTH_CLOUD_ID is required");
  return `${BASE_URL.replace(/\/+$/, "")}/rest/api/3`;
}

async function jiraRequest(path: string, init: RequestInit = {}) {
  const token = await jiraAccessToken();
  const url = `${jiraApiBase()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`jira api failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body as Record<string, unknown>;
}

function jiraDescriptionDoc(text: string) {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

async function executeCapability(message: JiraMessage) {
  switch (message.capability) {
    case "jira.create_issue": {
      ensureAllowedProject(message.payload.projectKey);
      assertApproved(message);
      const idempotencyKey = String(message.metadata?.idempotencyKey ?? "").trim();
      if (!idempotencyKey) {
        throw new Error("metadata.idempotencyKey is required for jira.create_issue");
      }
      const cacheHit = idempotency.get(idempotencyKey);
      if (cacheHit) return cacheHit;
      const payload = {
        fields: {
          project: { key: message.payload.projectKey },
          summary: message.payload.summary,
          issuetype: { name: message.payload.issueType ?? "Task" },
          description: jiraDescriptionDoc(String(message.payload.description ?? "")),
          ...(message.payload.priority
            ? { priority: { name: String(message.payload.priority) } }
            : {}),
          ...(Array.isArray(message.payload.labels)
            ? { labels: message.payload.labels }
            : {}),
        },
      };
      const created = await jiraRequest("/issue", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const result = {
        issueId: created.id,
        issueKey: created.key,
        url: `${BASE_URL ?? "https://atlassian.net"}/browse/${String(created.key ?? "")}`,
      };
      idempotency.set(idempotencyKey, result);
      await saveIdempotency();
      return result;
    }
    case "jira.get_issue": {
      const issueKey = String(message.payload.issueKey ?? "").trim();
      if (!issueKey) throw new Error("issueKey is required");
      return await jiraRequest(`/issue/${encodeURIComponent(issueKey)}`);
    }
    case "jira.search_issues": {
      const jql = String(message.payload.jql ?? "").trim();
      if (!jql) throw new Error("jql is required");
      return await jiraRequest("/search", {
        method: "POST",
        body: JSON.stringify({
          jql,
          maxResults: Number(message.payload.maxResults ?? 10),
          fields: message.payload.fields ?? ["summary", "status", "assignee"],
        }),
      });
    }
    case "jira.add_comment": {
      const issueKey = String(message.payload.issueKey ?? "").trim();
      const body = String(message.payload.body ?? "").trim();
      if (!issueKey || !body) throw new Error("issueKey and body are required");
      return await jiraRequest(`/issue/${encodeURIComponent(issueKey)}/comment`, {
        method: "POST",
        body: JSON.stringify({ body: jiraDescriptionDoc(body) }),
      });
    }
    case "jira.transition_issue": {
      assertApproved(message);
      const issueKey = String(message.payload.issueKey ?? "").trim();
      if (!issueKey) throw new Error("issueKey is required");
      let transitionId = String(message.payload.transitionId ?? "").trim();
      if (!transitionId) {
        const transitions = await jiraRequest(
          `/issue/${encodeURIComponent(issueKey)}/transitions`,
        );
        const items = Array.isArray(transitions.transitions)
          ? transitions.transitions
          : [];
        const desiredName = String(message.payload.transitionName ?? "").trim();
        const found = items.find((item) => String(item.name) === desiredName);
        transitionId = found ? String(found.id) : "";
      }
      if (!transitionId) {
        throw new Error("transitionId or a valid transitionName is required");
      }
      return await jiraRequest(`/issue/${encodeURIComponent(issueKey)}/transitions`, {
        method: "POST",
        body: JSON.stringify({ transition: { id: transitionId } }),
      });
    }
    default:
      throw new Error(`unsupported capability: ${String(message.capability)}`);
  }
}

function taskResponse(request: JsonRpcRequest, state: "completed" | "failed", text: string) {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: request.id ?? null,
    result: {
      id: `jira-agent-${Date.now()}`,
      kind: "task",
      status: {
        state,
        message: { role: "agent", parts: [{ kind: "text", text }] },
      },
      artifacts:
        state === "completed"
          ? [
              {
                name: "jira-agent-result",
                description: "Jira operation result",
                parts: [{ kind: "text", text }],
              },
            ]
          : [],
      metadata: { service: "jira-agent", state },
    },
  });
}

function jsonRpcError(id: JsonRpcRequest["id"], message: string) {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code: -32000, message },
  });
}

async function readJson(req: IncomingMessage): Promise<JsonRpcRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? (JSON.parse(body) as JsonRpcRequest) : {};
}

const server = createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const path = req.url ?? "/";

  if (method === "GET" && path === "/agent-card") {
    const card = {
      protocolVersion: "0.3.0",
      name: "Jira Agent",
      description: "A2A bridge for Jira issue operations",
      url: `http://localhost:${PORT}`,
      version: "1.0.0",
      skills: [
        "jira.create_issue",
        "jira.get_issue",
        "jira.search_issues",
        "jira.add_comment",
        "jira.transition_issue",
      ].map((name) => ({ id: name, name, description: name })),
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: true,
      },
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(card));
    return;
  }

  if (method === "POST" && (path === "/message/send" || path === "/tasks/send")) {
    try {
      const request = await readJson(req);
      if (request.method !== "message/send" && request.method !== "tasks/send") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(jsonRpcError(request.id, "unsupported JSON-RPC method"));
        return;
      }
      const message = parsePromptBody(request);
      const result = await executeCapability(message);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(taskResponse(request, "completed", JSON.stringify(result, null, 2)));
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        taskResponse(
          { id: null },
          "failed",
          `Jira Agent failed: ${message}`,
        ),
      );
      return;
    }
  }

  if (method === "GET" && path === "/healthz") {
    const hash = createHash("sha256")
      .update(String(BASE_URL ?? OAUTH_CLOUD_ID ?? "unset"))
      .digest("hex")
      .slice(0, 12);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, jira_target_hash: hash }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

void loadIdempotency().then(() => {
  server.listen(PORT, () => {
    console.log(`[jira-agent] listening on :${PORT}`);
  });
});
