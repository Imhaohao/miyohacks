import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = "/Users/yanzihao/Documents/miyohacks/research/agent-corpus";
const TODAY = "2026-06-11";

const rows = [
  r("Microsoft", "Microsoft Foundry Agent Service", "established", "enterprise-agent-platform", "Managed platform for building, deploying, and scaling AI agents.", "https://learn.microsoft.com/en-us/azure/foundry/agents/overview"),
  r("Microsoft", "Microsoft Copilot Studio agents", "established", "enterprise-agent-builder", "Low-code environment for building and publishing Microsoft Copilot agents.", "https://www.microsoft.com/en-us/microsoft-copilot/microsoft-copilot-studio"),
  r("Microsoft", "Microsoft 365 Copilot agents", "established", "productivity-agent-platform", "Agents in Microsoft 365 Copilot for work and business workflows.", "https://www.microsoft.com/en-us/microsoft-365/copilot"),
  r("Google Cloud", "Vertex AI Agent Builder", "established", "enterprise-agent-platform", "Google Cloud platform for building enterprise AI agents and conversational agents.", "https://cloud.google.com/products/agent-builder"),
  r("Google Cloud", "Google Agentspace", "established", "enterprise-search-agent", "Enterprise agent and search experience across company knowledge.", "https://cloud.google.com/products/agentspace"),
  r("Google", "Jules", "established", "coding-agent", "Asynchronous coding agent for GitHub-connected development tasks.", "https://jules.google/"),
  r("Amazon Web Services", "Amazon Bedrock Agents", "established", "enterprise-agent-platform", "AWS service for building agents that use foundation models, APIs, and knowledge bases.", "https://aws.amazon.com/bedrock/agents/"),
  r("Amazon Web Services", "Amazon Bedrock AgentCore", "established", "enterprise-agent-runtime", "AWS agent runtime and tooling for deploying AI agents.", "https://aws.amazon.com/bedrock/agentcore/"),
  r("Amazon Web Services", "Amazon Q Business", "established", "enterprise-assistant-agent", "Enterprise assistant that can answer questions and take action across business systems.", "https://aws.amazon.com/q/business/"),
  r("Salesforce", "Agentforce", "established", "crm-agent-platform", "Salesforce platform for deploying autonomous AI agents across CRM workflows.", "https://www.salesforce.com/agentforce/"),
  r("ServiceNow", "ServiceNow AI Agents", "established", "enterprise-workflow-agent", "ServiceNow agents for enterprise workflow automation.", "https://www.servicenow.com/products/ai-agents.html"),
  r("IBM", "watsonx Orchestrate", "established", "enterprise-workflow-agent", "IBM agentic automation platform for assistants and business agents.", "https://www.ibm.com/products/watsonx-orchestrate"),
  r("Oracle", "Oracle AI Agent Studio", "established", "enterprise-agent-builder", "Oracle platform for building AI agents in enterprise applications.", "https://www.oracle.com/artificial-intelligence/ai-agents/"),
  r("SAP", "Joule Agents", "established", "enterprise-workflow-agent", "SAP Joule and Joule agents for enterprise business processes.", "https://www.sap.com/products/artificial-intelligence.html"),
  r("Workday", "Workday Illuminate agents", "established", "hr-finance-agent", "Workday AI agents for HR and finance workflows.", "https://www.workday.com/en-us/artificial-intelligence.html"),
  r("Atlassian", "Rovo agents", "established", "enterprise-collaboration-agent", "Atlassian Rovo agents for knowledge and team workflows.", "https://www.atlassian.com/software/rovo"),
  r("GitHub", "GitHub Copilot coding agent", "established", "coding-agent", "Copilot coding agent and agent mode for software development workflows.", "https://github.com/features/copilot"),
  r("GitLab", "GitLab Duo Agent Platform", "established", "devops-agent-platform", "GitLab Duo and agent platform for AI-assisted software delivery.", "https://about.gitlab.com/gitlab-duo/"),
  r("Databricks", "Mosaic AI Agent Framework", "established", "data-agent-platform", "Databricks framework and platform for building data and AI agents.", "https://www.databricks.com/product/machine-learning/ai-agents"),
  r("Snowflake", "Snowflake Cortex Agents", "established", "data-agent-platform", "Cortex Agents for enterprise data, search, and tool-using agent workflows.", "https://www.snowflake.com/en/data-cloud/cortex/agents/"),
  r("NVIDIA", "NeMo Agent Toolkit", "established", "agent-toolkit", "Toolkit for connecting, evaluating, and operating enterprise AI agents.", "https://developer.nvidia.com/nemo"),
  r("UiPath", "UiPath Agentic Automation", "established", "rpa-agent-platform", "Agentic automation platform combining agents, robots, and orchestration.", "https://www.uipath.com/platform/agentic-automation"),
  r("Automation Anywhere", "AI Agent Studio", "established", "rpa-agent-platform", "Automation platform for building AI agents and automations.", "https://www.automationanywhere.com/products/ai-agent-studio"),
  r("Appian", "Appian AI Agents", "established", "process-agent-platform", "AI agents embedded into Appian process automation.", "https://appian.com/products/platform/artificial-intelligence"),
  r("Pegasystems", "Pega Agentic AI", "established", "workflow-agent-platform", "Agentic AI for enterprise workflow, service, and decisioning.", "https://www.pega.com/agentic-ai"),
  r("OpenAI", "OpenAI Agents SDK / Responses API", "established", "agent-sdk", "SDK and API surface for building agentic applications.", "https://platform.openai.com/docs/guides/agents"),
  r("OpenAI", "ChatGPT agent", "established", "consumer-agent", "ChatGPT agent features for web, tool, and task execution.", "https://openai.com/chatgpt/"),
  r("Anthropic", "Claude Code", "established", "coding-agent", "Agentic coding tool from Anthropic.", "https://www.anthropic.com/claude-code"),
  r("Anthropic", "Claude with MCP", "established", "agent-platform", "Claude ecosystem supports tool use and MCP-connected agent workflows.", "https://modelcontextprotocol.io/"),
  r("Mistral AI", "Agents API", "startup", "agent-api", "Mistral API surface for building agents and tool-using assistants.", "https://docs.mistral.ai/capabilities/agents/"),
  r("Cohere", "North", "startup", "enterprise-agent-platform", "Cohere enterprise AI workspace and agent platform.", "https://cohere.com/north"),
  r("Hugging Face", "smolagents", "established", "agent-framework", "Open-source library for building lightweight code agents.", "https://huggingface.co/docs/smolagents/index"),
  r("LangChain", "LangGraph Platform", "startup", "agent-framework", "Framework and platform for building reliable agents and multi-agent workflows.", "https://www.langchain.com/langgraph"),
  r("LlamaIndex", "LlamaCloud / LlamaIndex Agents", "startup", "agent-framework", "Framework and managed services for data-connected agents.", "https://www.llamaindex.ai/"),
  r("CrewAI", "CrewAI Enterprise", "startup", "multi-agent-platform", "Framework and platform for crews of role-based AI agents.", "https://www.crewai.com/"),
  r("Microsoft", "AutoGen", "established", "multi-agent-framework", "Open-source programming framework for multi-agent AI applications.", "https://microsoft.github.io/autogen/"),
  r("Microsoft", "Semantic Kernel Agent Framework", "established", "agent-framework", "Agent framework in Semantic Kernel for multi-agent orchestration.", "https://learn.microsoft.com/en-us/semantic-kernel/frameworks/agent/"),
  r("Haystack", "Haystack Agents", "startup", "agent-framework", "Open-source framework for retrieval and tool-using agents.", "https://haystack.deepset.ai/"),
  r("Letta", "Letta", "startup", "stateful-agent-platform", "Platform for stateful agents with long-term memory.", "https://www.letta.com/"),
  r("Mastra", "Mastra", "startup", "agent-framework", "TypeScript framework for building AI agents and workflows.", "https://mastra.ai/"),
  r("Vellum", "Vellum AI Agents", "startup", "agent-builder", "Platform for building, evaluating, and deploying AI agents and workflows.", "https://www.vellum.ai/"),
  r("Relevance AI", "Relevance AI workforce", "startup", "agent-workforce-platform", "No-code platform for building AI agents and multi-agent workforces.", "https://relevanceai.com/"),
  r("MindStudio", "MindStudio AI Agents", "startup", "agent-builder", "Platform for building and deploying AI agents.", "https://www.mindstudio.ai/"),
  r("Stack AI", "Stack AI Agents", "startup", "agent-builder", "Enterprise platform for building AI agents and workflow automations.", "https://www.stack-ai.com/"),
  r("Wordware", "Wordware", "startup", "agent-builder", "Natural-language IDE for building AI agents.", "https://www.wordware.ai/"),
  r("Dust", "Dust agents", "startup", "enterprise-agent-platform", "Platform for deploying custom AI agents for teams.", "https://dust.tt/"),
  r("Glean", "Glean Agents", "startup", "enterprise-search-agent", "Enterprise AI platform with assistants and agents over company knowledge.", "https://www.glean.com/product/agents"),
  r("Moveworks", "Moveworks AI Agent", "startup", "employee-support-agent", "Enterprise AI agent for employee support and workflow automation.", "https://www.moveworks.com/"),
  r("Aisera", "Aisera AI Agents", "startup", "enterprise-service-agent", "Agentic AI platform for IT, HR, customer service, and operations.", "https://aisera.com/"),
  r("Sierra", "Sierra Agent OS", "startup", "customer-service-agent", "Customer-facing AI agent platform.", "https://sierra.ai/"),
  r("Decagon", "Decagon AI Agents", "startup", "customer-service-agent", "AI agents for customer experience and support automation.", "https://decagon.ai/"),
  r("Intercom", "Fin", "established", "customer-service-agent", "AI customer service agent.", "https://www.intercom.com/fin"),
  r("Zendesk", "Zendesk AI agents", "established", "customer-service-agent", "AI agents for customer service and support.", "https://www.zendesk.com/service/ai/ai-agents/"),
  r("Ada", "Ada AI Agent", "startup", "customer-service-agent", "Customer-service automation and AI agent platform.", "https://www.ada.cx/"),
  r("Cognigy", "Cognigy.AI", "startup", "contact-center-agent", "Conversational and agentic AI platform for contact centers.", "https://www.cognigy.com/"),
  r("Kore.ai", "AI for Service / AI Agents", "startup", "enterprise-agent-platform", "Enterprise conversational and agentic AI platform.", "https://kore.ai/"),
  r("Rasa", "Rasa agents", "startup", "conversation-agent-platform", "Platform for conversational AI agents in enterprise service workflows.", "https://rasa.com/"),
  r("Forethought", "Forethought AI Agents", "startup", "customer-support-agent", "AI agent platform for customer support.", "https://forethought.ai/"),
  r("Crescendo", "Crescendo CX AI", "startup", "customer-support-agent", "AI customer support platform combining automation and human operations.", "https://www.crescendo.ai/"),
  r("Ultimate", "Ultimate AI agents", "startup", "customer-support-agent", "Customer support automation and AI agents.", "https://www.ultimate.ai/"),
  r("PolyAI", "PolyAI voice assistants", "startup", "voice-agent", "Voice AI agents for customer service.", "https://poly.ai/"),
  r("Parloa", "Parloa AI Agent Management Platform", "startup", "voice-agent", "Enterprise AI agent platform for customer communications.", "https://www.parloa.com/"),
  r("Talkdesk", "Talkdesk Autopilot", "established", "contact-center-agent", "Autonomous customer-service AI agent for contact centers.", "https://www.talkdesk.com/products/autopilot/"),
  r("Cresta", "Cresta AI Agent", "startup", "contact-center-agent", "AI agents and copilots for contact centers.", "https://cresta.com/"),
  r("Uniphore", "Uniphore AI agents", "established", "customer-service-agent", "Enterprise conversational AI and agent automation.", "https://www.uniphore.com/"),
  r("yellow.ai", "yellow.ai Dynamic AI Agents", "startup", "customer-service-agent", "Dynamic AI agents for customer and employee service.", "https://yellow.ai/"),
  r("Maven AGI", "Maven AGI", "startup", "customer-support-agent", "AI-native customer support agents.", "https://www.mavenagi.com/"),
  r("Ema", "Ema Universal AI Employee", "startup", "enterprise-agent-platform", "Universal AI employee and agent platform for enterprise tasks.", "https://www.ema.co/"),
  r("Orby AI", "Orby AI", "startup", "enterprise-automation-agent", "AI agents for automating enterprise workflows.", "https://www.orby.ai/"),
  r("Lindy", "Lindy", "startup", "personal-workflow-agent", "AI employees and agents for business workflows.", "https://www.lindy.ai/"),
  r("Zapier", "Zapier Agents", "established", "workflow-agent-platform", "No-code AI agents connected to Zapier automations.", "https://zapier.com/agents"),
  r("n8n", "n8n AI Agents", "startup", "workflow-agent-platform", "Workflow automation platform for building AI agents.", "https://n8n.io/ai/"),
  r("Make", "Make AI Agents", "established", "workflow-agent-platform", "Automation platform for AI agents and workflows.", "https://www.make.com/en/ai-agents"),
  r("Gumloop", "Gumloop AI Agents", "startup", "workflow-agent-platform", "No-code AI automation and agent platform.", "https://www.gumloop.com/"),
  r("Relay.app", "Relay.app AI agents", "startup", "workflow-agent-platform", "Workflow automation platform with AI agents.", "https://www.relay.app/"),
  r("Bardeen", "Bardeen AI Agent", "startup", "browser-workflow-agent", "Browser automation and workflow AI agent.", "https://www.bardeen.ai/"),
  r("Artisan", "Ava / Artisan AI employees", "startup", "sales-agent", "AI employees for sales and go-to-market work.", "https://www.artisan.co/"),
  r("11x", "11x AI digital workers", "startup", "sales-agent", "AI sales development and revenue agents.", "https://www.11x.ai/"),
  r("Clay", "Claygent", "startup", "gtm-agent", "AI research agent for go-to-market data enrichment.", "https://www.clay.com/"),
  r("Regie.ai", "Regie.ai agents", "startup", "sales-agent", "AI agents for sales prospecting and outbound workflows.", "https://www.regie.ai/"),
  r("Qualified", "Piper AI SDR", "startup", "sales-agent", "AI SDR agent for website pipeline generation.", "https://www.qualified.com/"),
  r("Conversica", "Conversica AI Assistants", "established", "sales-service-agent", "AI assistants for revenue teams.", "https://www.conversica.com/"),
  r("Drift", "Drift AI chat agents", "established", "sales-chat-agent", "Conversational marketing and sales AI agents.", "https://www.drift.com/"),
  r("Cognition", "Devin", "startup", "coding-agent", "Autonomous AI software engineer.", "https://devin.ai/"),
  r("Anysphere", "Cursor", "startup", "coding-agent", "AI code editor with agentic coding workflows.", "https://cursor.com/"),
  r("Replit", "Replit Agent", "startup", "coding-agent", "Agent for building apps and software in Replit.", "https://replit.com/agent"),
  r("Windsurf", "Windsurf Editor", "startup", "coding-agent", "Agentic coding IDE.", "https://windsurf.com/"),
  r("Magic", "Magic coding agents", "startup", "coding-agent", "AI coding agent research and product company.", "https://magic.dev/"),
  r("Poolside", "poolside", "startup", "coding-agent", "AI coding assistant and agent company.", "https://poolside.ai/"),
  r("Factory", "Factory Droid agents", "startup", "coding-agent", "AI software engineering agents.", "https://www.factory.ai/"),
  r("Codegen", "Codegen", "startup", "coding-agent", "AI agents for automating software engineering tasks.", "https://www.codegen.com/"),
  r("Sweep", "Sweep AI", "startup", "coding-agent", "AI junior developer for GitHub issues and code changes.", "https://sweep.dev/"),
  r("Qodo", "Qodo Merge / Gen", "startup", "coding-agent", "AI coding and code review agents.", "https://www.qodo.ai/"),
  r("Tabnine", "Tabnine AI agents", "startup", "coding-agent", "AI software development agents and assistants.", "https://www.tabnine.com/"),
  r("Sourcegraph", "Amp", "startup", "coding-agent", "Agentic coding tool from Sourcegraph.", "https://ampcode.com/"),
  r("Continue", "Continue", "startup", "coding-agent", "Open-source AI code assistant and agent framework.", "https://www.continue.dev/"),
  r("All Hands AI", "OpenHands", "startup", "coding-agent", "Open-source coding agent formerly OpenDevin.", "https://www.all-hands.dev/"),
  r("Augment Code", "Augment Code", "startup", "coding-agent", "AI coding agent for large codebases.", "https://www.augmentcode.com/"),
  r("JetBrains", "Junie", "established", "coding-agent", "JetBrains coding agent for IDE workflows.", "https://www.jetbrains.com/junie/"),
  r("CodeRabbit", "CodeRabbit", "startup", "code-review-agent", "AI code review agent for pull requests.", "https://www.coderabbit.ai/"),
  r("Lovable", "Lovable", "startup", "app-building-agent", "AI app builder that turns prompts into software.", "https://lovable.dev/"),
  r("StackBlitz", "Bolt.new", "startup", "app-building-agent", "AI app-building agent in the browser.", "https://bolt.new/"),
  r("Vercel", "v0", "established", "app-building-agent", "AI UI and app generation agent from Vercel.", "https://v0.dev/"),
  r("Emergent", "Emergent", "startup", "app-building-agent", "AI app builder that turns ideas into apps.", "https://emergent.sh/"),
  r("Rork", "Rork", "startup", "mobile-app-agent", "AI agent for building mobile apps.", "https://rork.com/"),
  r("Tempo Labs", "Tempo", "startup", "app-building-agent", "AI agent for product and frontend development.", "https://www.tempo.new/"),
  r("Manus", "Manus", "startup", "general-purpose-agent", "General-purpose AI agent for tasks such as slides, websites, development, and design.", "https://manus.im/"),
  r("Adept", "ACT-1", "startup", "computer-use-agent", "Action Transformer agent research for using software tools.", "https://www.adept.ai/"),
  r("MultiOn", "MultiOn", "startup", "web-agent", "AI web agent for browsing and completing tasks.", "https://www.multion.ai/"),
  r("Induced AI", "Induced AI", "startup", "browser-agent", "Browser agents for automating web workflows.", "https://www.induced.ai/"),
  r("Skyvern", "Skyvern", "startup", "browser-agent", "AI browser automation agent for web tasks.", "https://www.skyvern.com/"),
  r("Browserbase", "Browserbase", "startup", "browser-agent-infrastructure", "Infrastructure for browser agents and computer-use automation.", "https://www.browserbase.com/"),
  r("Browser Use", "Browser Use", "startup", "browser-agent-framework", "Open-source browser automation framework for AI agents.", "https://browser-use.com/"),
  r("Puppeteer", "Stagehand", "startup", "browser-agent-framework", "Browserbase framework for building browser agents.", "https://www.browserbase.com/stagehand"),
  r("Hyperbrowser", "HyperAgent", "startup", "browser-agent", "Web infrastructure and agent for browser automation.", "https://www.hyperbrowser.ai/"),
  r("Perplexity", "Comet", "startup", "browser-agent", "AI browser with agentic browsing capabilities.", "https://www.perplexity.ai/comet"),
  r("Rabbit", "Rabbit R1 / Large Action Model", "startup", "consumer-action-agent", "Consumer AI device and action model for task execution.", "https://www.rabbit.tech/"),
  r("Abridge", "Abridge", "startup", "healthcare-agent", "Clinical AI documentation and workflow assistant.", "https://www.abridge.com/"),
  r("Ambience Healthcare", "Ambience Healthcare", "startup", "healthcare-agent", "AI operating system and agents for clinicians.", "https://www.ambiencehealthcare.com/"),
  r("Nabla", "Nabla Copilot", "startup", "healthcare-agent", "AI clinical assistant for documentation and care workflows.", "https://www.nabla.com/"),
  r("Hippocratic AI", "Hippocratic AI agents", "startup", "healthcare-agent", "Safety-focused healthcare AI agents.", "https://www.hippocraticai.com/"),
  r("Tennr", "Tennr", "startup", "healthcare-operations-agent", "AI agents for healthcare document and referral workflows.", "https://www.tennr.com/"),
  r("Anterior", "Florence", "startup", "healthcare-agent", "AI clinical and administrative agents for healthcare payers.", "https://www.anterior.com/"),
  r("EliseAI", "EliseAI", "startup", "property-healthcare-agent", "AI agents for housing, healthcare, and operations.", "https://www.eliseai.com/"),
  r("Harvey", "Harvey", "startup", "legal-agent", "AI platform and agents for legal work.", "https://www.harvey.ai/"),
  r("EvenUp", "Claims Intelligence Platform", "startup", "legal-agent", "AI agents and workflow automation for personal injury law.", "https://www.evenuplaw.com/"),
  r("Thomson Reuters", "CoCounsel", "established", "legal-agent", "Professional AI legal and tax assistant agent.", "https://legal.thomsonreuters.com/en/c/cocounsel"),
  r("Norm Ai", "Norm Ai", "startup", "compliance-agent", "AI agents for regulatory compliance.", "https://www.norm.ai/"),
  r("Legora", "Legora", "startup", "legal-agent", "Collaborative AI platform for lawyers and legal workflows.", "https://www.legora.com/"),
  r("Hebbia", "Hebbia Matrix", "startup", "research-agent", "AI agent for complex document and financial research.", "https://www.hebbia.ai/"),
  r("Perplexity", "Perplexity Deep Research", "startup", "research-agent", "AI answer and research agent.", "https://www.perplexity.ai/"),
  r("You.com", "You.com ARI / agents", "startup", "research-agent", "AI search and research agents.", "https://you.com/"),
  r("Genspark", "Genspark AI agents", "startup", "research-agent", "AI agent engine for search, research, slides, and task execution.", "https://www.genspark.ai/"),
  r("Tavily", "Tavily", "startup", "agent-search-api", "Search API built for AI agents.", "https://tavily.com/"),
  r("Exa", "Exa", "startup", "agent-search-api", "Search engine API for AI agents.", "https://exa.ai/"),
  r("Firecrawl", "Firecrawl", "startup", "agent-web-data", "Web data API for AI agents.", "https://www.firecrawl.dev/"),
  r("Browserless", "Browserless", "startup", "browser-agent-infrastructure", "Browser automation infrastructure used by agents.", "https://www.browserless.io/"),
  r("Composio", "Composio", "startup", "agent-tool-infrastructure", "Tool integration platform for AI agents.", "https://composio.dev/"),
  r("Arcade.dev", "Arcade", "startup", "agent-tool-infrastructure", "Tool calling, auth, and integrations for AI agents.", "https://www.arcade.dev/"),
  r("Pipedream", "Pipedream Connect", "startup", "agent-integration-platform", "Connect APIs and actions to AI agents.", "https://pipedream.com/connect"),
  r("Smithery", "Smithery", "startup", "mcp-registry-platform", "Registry and deployment platform for MCP servers used by agents.", "https://smithery.ai/"),
  r("Klavis AI", "Klavis AI", "startup", "mcp-agent-infrastructure", "Hosted MCP integration infrastructure for AI applications.", "https://www.klavis.ai/"),
  r("Metorial", "Metorial", "startup", "mcp-agent-infrastructure", "Managed MCP infrastructure for agent integrations.", "https://metorial.com/"),
  r("Dedalus Labs", "Dedalus Labs", "startup", "agent-runtime-platform", "Compute substrate and SDK for AI agents and MCP tools.", "https://dedaluslabs.ai/"),
  r("Blaxel", "Blaxel", "startup", "agent-runtime-platform", "Serverless platform for agent deployments and MCP hosting.", "https://www.blaxel.ai/"),
  r("Langfuse", "Langfuse", "startup", "agent-observability", "Open-source observability and evaluation for LLM apps and agents.", "https://langfuse.com/"),
  r("LangSmith", "LangSmith", "startup", "agent-observability", "Observability, evaluation, and deployment platform for agents.", "https://www.langchain.com/langsmith"),
  r("Arize AI", "Phoenix", "startup", "agent-observability", "Open-source AI observability and evaluation for LLM agents.", "https://phoenix.arize.com/"),
  r("Weights & Biases", "W&B Weave", "established", "agent-observability", "Tracing and evaluation for LLM applications and agents.", "https://wandb.ai/site/weave/"),
];

function r(company, product, company_type, category, evidence_summary, evidence_url) {
  return {
    company,
    product,
    company_type,
    category,
    agent_surface: inferSurface(category),
    evidence_summary,
    evidence_url,
    protocol_or_invocation: inferProtocol(category, product, evidence_summary),
    verification_status: "agent_product_found",
    discovery_date: TODAY,
    notes: "Broad agent-company sourcing row; not an Arbor invokability claim unless protocol_or_invocation names MCP/A2A/API and a separate endpoint is verified.",
  };
}

function inferSurface(category) {
  if (category.includes("coding")) return "coding_agent";
  if (category.includes("customer") || category.includes("contact")) return "customer_service_agent";
  if (category.includes("workflow") || category.includes("rpa")) return "workflow_agent";
  if (category.includes("browser")) return "browser_or_computer_use_agent";
  if (category.includes("mcp")) return "mcp_or_agent_tooling";
  if (category.includes("platform") || category.includes("framework") || category.includes("runtime")) return "agent_platform";
  return "agent_product";
}

function inferProtocol(category, product, summary) {
  const text = `${category} ${product} ${summary}`.toLowerCase();
  const hits = [];
  if (text.includes("mcp")) hits.push("mcp");
  if (text.includes("a2a")) hits.push("a2a");
  if (text.includes("api")) hits.push("api");
  if (text.includes("sdk")) hits.push("sdk");
  if (text.includes("browser")) hits.push("browser_automation");
  return hits.length ? hits.join("|") : "product_or_platform";
}

const unique = [];
const seen = new Set();
for (const row of rows) {
  const key = `${row.company}|${row.product}`.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(row);
}

await mkdir(ROOT, { recursive: true });
await writeFile(path.join(ROOT, "expanded-agent-companies.json"), `${JSON.stringify(unique, null, 2)}\n`);
await writeFile(path.join(ROOT, "expanded-agent-companies.csv"), toCsv(unique));
await writeFile(
  path.join(ROOT, "expanded-agent-companies-audit.md"),
  renderAudit(unique),
);

console.log(`wrote ${unique.length} expanded agent company rows`);

function toCsv(rows) {
  const headers = [
    "company",
    "product",
    "company_type",
    "category",
    "agent_surface",
    "evidence_summary",
    "evidence_url",
    "protocol_or_invocation",
    "verification_status",
    "discovery_date",
    "notes",
  ];
  return `${headers.join(",")}\n${rows
    .map((row) => headers.map((header) => csvEscape(row[header])).join(","))
    .join("\n")}\n`;
}

function renderAudit(rows) {
  const byType = countBy(rows, (row) => row.company_type);
  const bySurface = countBy(rows, (row) => row.agent_surface);
  return `# Expanded Agent Companies Audit

Generated: ${TODAY}

This sheet adds startups and established companies with AI-agent products or
agent platforms. It is intentionally broader than the MCP/A2A and YC sheets:
rows indicate an agent product, framework, runtime, or infrastructure surface,
not guaranteed Arbor reachability.

## Counts

| Metric | Count |
|---|---:|
| Rows | ${rows.length} |
| Startups | ${rows.filter((row) => row.company_type === "startup").length} |
| Established companies | ${rows.filter((row) => row.company_type === "established").length} |

## Company Type

| Type | Count |
|---|---:|
${byType.map(([key, value]) => `| ${key} | ${value} |`).join("\n")}

## Agent Surface

| Surface | Count |
|---|---:|
${bySurface.map(([key, value]) => `| ${key} | ${value} |`).join("\n")}

## Review Notes

- Use this as a prospecting/source sheet, not as a verified invokable-agent corpus.
- Rows with \`protocol_or_invocation\` containing \`mcp\`, \`a2a\`, \`api\`, or \`sdk\` should be prioritized for deeper endpoint verification.
- Microsoft Foundry Agent Service is included as the canonical established-company example requested by the user.
`;
}

function countBy(rows, fn) {
  const counts = new Map();
  for (const row of rows) counts.set(fn(row), (counts.get(fn(row)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
