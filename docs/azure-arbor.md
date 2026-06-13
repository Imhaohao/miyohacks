# Arbor on Azure Credits

This is the switchable Azure path for spending credits on Arbor without making
Azure a permanent dependency.

Print the executable end-to-end activation/off checklist:

```bash
npm run azure:runbook
npm run azure:runbook -- --format json
```

## Runtime Switch

Arbor model calls now route through `ARBOR_MODEL_PROVIDER`:

| Value | Behavior |
|---|---|
| `openai` | Existing direct OpenAI path. |
| `azure-openai` | Azure OpenAI / Foundry OpenAI deployments. Prefer `AZURE_OPENAI_API_MODE=responses` for GPT-5. |
| `foundry` | Microsoft Foundry Models chat-completions deployments. |
| `disabled` | Fail fast. Convex fallbacks stop remote model spend immediately. |

For local development:

```bash
ARBOR_MODEL_PROVIDER=azure-openai
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_API_MODE=responses
AZURE_OPENAI_AGENT_DEPLOYMENT=gpt5-agent
AZURE_OPENAI_JUDGE_DEPLOYMENT=arbor-judge-base
AZURE_OPENAI_SUGGESTER_DEPLOYMENT=arbor-suggester-base
ARBOR_REQUIRE_AZURE=true
ARBOR_MODEL_SPEND_DISABLED=false
```

For Convex actions, set the same values on the Convex deployment:

```bash
npx convex env set ARBOR_MODEL_PROVIDER azure-openai
npx convex env set AZURE_OPENAI_ENDPOINT 'https://<resource>.openai.azure.com'
npx convex env set AZURE_OPENAI_API_KEY '...'
npx convex env set AZURE_OPENAI_API_MODE responses
npx convex env set AZURE_OPENAI_AGENT_DEPLOYMENT gpt5-agent
npx convex env set AZURE_OPENAI_JUDGE_DEPLOYMENT arbor-judge-base
npx convex env set AZURE_OPENAI_SUGGESTER_DEPLOYMENT arbor-suggester-base
npx convex env set ARBOR_REQUIRE_AZURE true
npx convex env set ARBOR_MODEL_SPEND_DISABLED false
```

Smoke test a route before running an auction:

```bash
npm run model:smoke -- agent
npm run model:smoke -- judge
npm run model:smoke -- suggester
```

Print every local, Convex, worker, and coding-tool env value from one source:

```bash
npm run azure:env
```

Preview or write local `.env.local` switch settings:

```bash
npm run azure:local -- status
npm run azure:local -- azure-openai
npm run azure:local -- azure-openai --apply
npm run azure:local -- foundry --apply
```

`azure:local` dry-runs by default, preserves unrelated `.env.local` lines, and
creates a timestamped backup before writing unless `--no-backup` is passed. It
does not materialize API keys from your shell unless you add
`--materialize-secret`; otherwise it preserves any existing key already in the
file.

Apply the Azure model runtime to Convex:

```bash
npm run azure:env -- convex --apply
```

Preview or apply the same switch to the hosted Vercel project:

```bash
npm run azure:vercel -- azure-openai
npm run azure:vercel -- azure-openai --apply
npm run azure:vercel -- foundry --apply
```

`azure:vercel` writes `production`, `preview`, and `development` env vars by
default. Use `--env production` to target one environment, and
`--materialize-secret` only when your current shell contains the API key you
want Vercel to store. `--apply` refuses placeholder values such as
`<AZURE_OPENAI_API_KEY>` unless `--allow-placeholders` is passed deliberately.

## Instant Off

Local:

```bash
ARBOR_MODEL_PROVIDER=disabled
```

Or patch `.env.local` directly:

```bash
npm run azure:local -- off
npm run azure:local -- off --apply
```

Convex:

```bash
npx convex env set ARBOR_MODEL_PROVIDER disabled
```

Dry-run the full shutoff commands:

```bash
npm run azure:off
```

Apply them:

```bash
npm run azure:off -- --apply
```

Include Vercel hosted env in the shutoff:

```bash
npm run azure:off -- --vercel
npm run azure:off -- --apply --vercel
```

Verify the switch is actually off:

```bash
npm run azure:off -- --verify
```

Hard-stop Azure service charges by deleting the Arbor resource group:

```bash
npm run azure:off -- --delete-resource-group --resource-group arbor-ai-rg
npm run azure:off -- --apply --delete-resource-group --resource-group arbor-ai-rg --confirm-resource-group arbor-ai-rg
npm run azure:off -- --verify --delete-resource-group --resource-group arbor-ai-rg
```

`--delete-resource-group` is destructive and deletes resources in
`AZURE_RESOURCE_GROUP` or `--resource-group <name>`, including Azure OpenAI,
Search, Storage, Log Analytics, and any Container Apps worker created by the
Arbor template. It is dry-run by default. Applying it requires
`--confirm-resource-group <exact-name>` and starts an asynchronous Azure
resource-group deletion with `--no-wait`. The subscription budget guardrail is
left in place.

`--verify` checks local env, Convex env, and any configured Azure Container App
or Web App. `npm run azure:off -- --apply --verify` applies the remote switch
and then verifies it. Local verification still requires `.env.local` to include
`ARBOR_MODEL_PROVIDER=disabled` and `ARBOR_MODEL_SPEND_DISABLED=true`.

The script disables Convex model calls and, when `AZURE_RESOURCE_GROUP` plus
`AZURE_CONTAINER_APP_NAME` are set, scales the Azure Container Apps worker to
zero replicas. With `--vercel`, it also writes hosted Vercel env vars that set
`ARBOR_MODEL_PROVIDER=disabled` and `ARBOR_MODEL_SPEND_DISABLED=true`. Azure
OpenAI standard deployments do not incur idle token charges; the important
runtime shutoff is preventing application calls. Use the hard-stop command above
when you also want to remove the Azure resources that can continue to accrue
small standing charges.

`ARBOR_REQUIRE_AZURE=true` makes Arbor fail closed instead of falling back to
direct OpenAI when Azure env is incomplete. `ARBOR_MODEL_SPEND_DISABLED=true`
is checked before every model call and stops remote inference immediately.
Optional caps such as `ARBOR_MAX_OUTPUT_TOKENS`,
`ARBOR_JUDGE_MAX_OUTPUT_TOKENS`, and `ARBOR_SUGGESTER_MAX_OUTPUT_TOKENS` clamp
completion size without changing call sites.

## Azure Resources

Check local and Azure subscription prerequisites before applying anything:

```bash
npm run azure:prereqs
npm run azure:prereqs -- --register-providers --apply
```

`azure:prereqs` is dry-run by default. It checks Node/npm dependencies, Azure
CLI auth, Bicep support, budget settings, and the resource providers required
by the Arbor Bicep templates. The provider registration command is the first
subscription-mutating step and should be run only after `az login` points at the
intended subscription.

Deploy the resource group template:

```bash
npm run azure:bootstrap
npm run azure:capacity
npm run azure:bootstrap -- --apply --budget-email you@example.com
```

`npm run azure:capacity` is a live Azure CLI preflight. It checks that the
region/subscription expose the GPT-5 agent model, the judge/suggester base
models, the requested SKUs, and available quota before the Bicep deployment is
applied. Override the defaults with flags such as `--location`,
`--agent-model`, `--agent-version`, `--agent-sku`, `--judge-model`, and
`--suggester-model`.

Add the budget guardrail at subscription scope:

```bash
az deployment sub create \
  --location eastus \
  --template-file infra/azure/budget.bicep \
  --parameters infra/azure/budget.example.bicepparam
```

The bootstrap script dry-runs by default. With `--apply --set-convex`, it creates
the Azure resources, fetches the Azure OpenAI key, and writes the Azure model env
to Convex:

```bash
npm run azure:bootstrap -- --apply --set-convex --budget-email you@example.com
```

By default the budget is named `arbor-azure-credits-guardrail`, assumes
`AZURE_CREDITS_TOTAL=10000`, and sets `AZURE_MONTHLY_BUDGET=9500`. Keep the
budget below the credit total so there is room for taxes, delayed metering,
and accidental non-Arbor usage.

The group template creates:

- Azure OpenAI account.
- GPT-5 agent deployment named `gpt5-agent`.
- GPT-4.1-mini base deployments for `arbor-judge-base` and `arbor-suggester-base`.
- Azure AI Search for future specialist/reputation retrieval.
- Storage for fine-tune artifacts and benchmark outputs.
- Log Analytics.
- Optional Container Apps worker when `workerImage` is supplied.

Audit readiness without paid model calls:

```bash
npm run azure:ready
```

Full readiness is intentionally strict. It checks Azure CLI auth, the
subscription budget guardrail, the Azure OpenAI account, the GPT-5 agent
deployment, an applied fine-tune manifest, deployed fine-tuned judge/suggester
models, and that Arbor is actually pointing judge/suggester traffic at those
fine-tuned deployments. It should fail until the Azure side is fully wired.

Check only repo-side wiring without requiring Azure CLI or credentials:

```bash
npm run azure:ready -- --repo-only
```

Audit readiness and make low-token model calls to the agent, judge, and suggester
deployments:

```bash
npm run azure:ready -- --smoke
```

Deploy the standalone A2A worker to Container Apps:

```bash
az acr build --registry <acr-name> --image arbor-a2a-worker:latest a2a-worker
az deployment group create \
  --resource-group arbor-ai-rg \
  --template-file infra/azure/main.bicep \
  --parameters workerImage=<acr-name>.azurecr.io/arbor-a2a-worker:latest azureOpenAIKey="$AZURE_OPENAI_API_KEY" workerBearerToken="$ARBOR_WORKER_BEARER"
```

Common readiness failures:

| Command | Symptom | Check next |
|---|---|---|
| `azure:ready` | Budget or account checks fail | Confirm Azure CLI login, subscription, `AZURE_RESOURCE_GROUP`, and budget name. |
| `azure:ready -- --smoke` | Model smoke fails | Confirm `AZURE_OPENAI_ENDPOINT`, API key, and deployment names all point at deployed models. |
| Worker deployment | `workerUrl` is empty | Set `workerImage`, `workerBearerToken`, and `azureOpenAIKey`; the template skips the worker without all three. |

## Fine-Tuning Judge And Suggester

Generate JSONL datasets:

```bash
npm run ft:data
npm run ft:validate
npm run ft:eval
```

`ft:validate` checks the Azure SFT chat JSONL format and Arbor-specific output
contracts for judge and suggester examples. `ft:eval` uses the held-out test
set in reference mode by default. Add `-- --live` after configuring Azure to
score the active base or fine-tuned deployment:

```bash
npm run ft:eval -- judge --live
npm run ft:eval -- suggester --live --output data/fine-tuning/eval-report.suggester-live.json
```

Preferred: run the manifest-driven pipeline. It dry-runs by default, then with
`--apply` it generates data, validates the JSONL, runs the held-out reference
eval, uploads files, creates both fine-tune jobs, and writes
`data/fine-tuning/azure-finetune-manifest.json`:

```bash
npm run azure:ft:pipeline
npm run azure:ft:pipeline -- start --apply
npm run azure:ft:pipeline -- status
npm run azure:ft:pipeline -- deploy --apply
```

Fine-tune troubleshooting:

| Command | Symptom | Check next |
|---|---|---|
| `ft:validate` | JSONL validation fails | Inspect `data/fine-tuning/validation-report.json`, fix the generated examples, then rerun `npm run ft:data && npm run ft:validate`. |
| `ft:eval` | Held-out score is unexpectedly low | Inspect `data/fine-tuning/eval-report.json` and compare failures against the source examples before uploading. |
| `azure:ft:pipeline status` | Job stays pending or failed | Check Azure quota/model availability with `npm run azure:capacity` and inspect job events with `npm run azure:ft -- events <job-id>`. |

Upload files:

```bash
npm run azure:ft -- upload data/fine-tuning/arbor-suggester.train.jsonl
npm run azure:ft -- upload data/fine-tuning/arbor-suggester.validation.jsonl
npm run azure:ft -- upload data/fine-tuning/arbor-judge.train.jsonl
npm run azure:ft -- upload data/fine-tuning/arbor-judge.validation.jsonl
```

Create SFT jobs:

```bash
npm run azure:ft -- create \
  --training-file <suggester-train-file-id> \
  --validation-file <suggester-validation-file-id> \
  --model gpt-4.1-mini-2025-04-14 \
  --suffix arb-suggest \
  --training-type GlobalStandard

npm run azure:ft -- create \
  --training-file <judge-train-file-id> \
  --validation-file <judge-validation-file-id> \
  --model gpt-4.1-mini-2025-04-14 \
  --suffix arb-judge \
  --training-type GlobalStandard
```

Check status:

```bash
npm run azure:ft -- status <job-id>
npm run azure:ft -- events <job-id>
npm run azure:ft -- checkpoints <job-id>
```

Deploy completed fine-tuned jobs directly:

```bash
export AZURE_SUBSCRIPTION_ID=<subscription-id>
export AZURE_RESOURCE_GROUP=arbor-ai-rg
export AZURE_OPENAI_RESOURCE_NAME=<azure-openai-resource-name>

npm run azure:ft -- deploy \
  --from-job <suggester-fine-tune-job-id> \
  --deployment arbor-suggester

npm run azure:ft -- deploy \
  --from-job <judge-fine-tune-job-id> \
  --deployment arbor-judge
```

If the Azure job response does not expose the final model name, pass the model
or checkpoint ID explicitly with `--model <fine-tuned-model-or-checkpoint-id>`.

Switch Arbor to the deployed fine-tuned judge/suggester:

```bash
AZURE_OPENAI_JUDGE_DEPLOYMENT=arbor-judge \
AZURE_OPENAI_SUGGESTER_DEPLOYMENT=arbor-suggester \
npm run azure:env -- convex --apply
```

Microsoft’s current fine-tuning docs list GPT-4.1-mini/4.1 for SFT and GPT-5
for reinforcement fine-tuning, with GPT-5 RFT access gated by invitation. Use
GPT-5 for the main agent inference path now; use SFT judge/suggester deployments
until GPT-5 RFT is available on the subscription.

## Coding API / Dev Tooling

For OpenAI-compatible coding tools that accept a base URL:

```bash
OPENAI_BASE_URL=https://<resource>.openai.azure.com/openai/v1
OPENAI_API_KEY=$AZURE_OPENAI_API_KEY
OPENAI_MODEL=<deployment-name>
OPENAI_API_KEY_HEADER=api-key
```

Generate those values from your Arbor Azure env:

```bash
npm run azure:env -- devtools
```

For shell usage:

```bash
eval "$(npm run --silent azure:env -- devtools)"
```

For tools that load a dotenv file, write an ignored local file:

```bash
npm run azure:env -- devtools --format dotenv --output .env.azure-devtools
```

Use `--format json` for tools that accept structured config. Add
`--materialize-secret` only when the output file must contain the literal API
key; generated `*.azure-devtools.env` files are ignored by git.

Verify the same OpenAI-compatible route a coding tool would use:

```bash
npm run azure:devtools:smoke -- --env-file .env.azure-devtools
```

This makes one low-token paid `chat/completions` request through
`OPENAI_BASE_URL`, `OPENAI_MODEL`, and `OPENAI_API_KEY_HEADER`.

If this fails, first confirm the generated env file contains the expected base
URL, deployment name, and `OPENAI_API_KEY_HEADER=api-key`; then run the same
command with `--verbose` and check whether Azure returned auth, deployment, or
quota errors.

For Microsoft Foundry Models deployments:

```bash
npm run azure:env -- devtools --provider foundry
```

For tools that support Azure OpenAI-specific variables:

```bash
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_DEPLOYMENT=gpt5-agent
AZURE_OPENAI_API_MODE=responses
```

Official docs used for this setup:

- Azure OpenAI Responses API: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses
- Azure OpenAI v1 API lifecycle: https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle
- Fine-tuning workflow and supported models: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/fine-tuning
- Foundry Models endpoints: https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/endpoints
