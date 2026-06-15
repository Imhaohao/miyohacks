# Azure Working TODO

Last checked: 2026-06-13

This is the short checklist for getting Arbor fully onto Azure credits. The
full runbook is `docs/azure-arbor.md`; this file is the execution TODO.

## Current State

- [x] Repo-side Azure wiring exists.
- [x] Fine-tune JSONL exists for both roles:
  - Suggester: 24 train, 6 validation, 6 test.
  - Judge: 18 train, 4 validation, 4 test.
- [x] Repo-only readiness passes with `npm run azure:ready -- --repo-only`.
- [ ] Azure CLI is installed.
- [ ] Azure CLI is logged into the target subscription.
- [ ] Local provider is switched from `openai` to `azure-openai` or `foundry`.
- [ ] `ARBOR_REQUIRE_AZURE=true` is set for live Arbor environments.
- [ ] Applied fine-tune manifest exists at `data/fine-tuning/azure-finetune-manifest.json`.

Do not run any `--apply` Azure command until the target subscription is selected
and the budget alert email is set.

## 1. Install And Authenticate Azure CLI

- [ ] Install Azure CLI.

```bash
brew install azure-cli
```

- [ ] Log in and select the subscription that owns the $10,000 credits.

```bash
az login
az account set --subscription <subscription-id>
```

- [ ] Set shell env for the Arbor Azure target.

```bash
export AZURE_SUBSCRIPTION_ID=<subscription-id>
export AZURE_RESOURCE_GROUP=arbor-ai-rg
export AZURE_LOCATION=northcentralus
export AZURE_CREDITS_TOTAL=10000
export AZURE_MONTHLY_BUDGET=9500
export AZURE_BUDGET_EMAIL=<your-alert-email>
```

- [ ] Register required providers and verify prerequisites.

```bash
npm run azure:prereqs -- --register-providers --apply
```

Done when: `npm run azure:prereqs` passes required checks.

## 2. Check Model Capacity Before Spending

- [ ] Check model availability, SKU support, and quota.

```bash
npm run azure:capacity
```

Done when: the GPT-5 agent target and judge/suggester base deployments all pass
capacity checks.

## 3. Provision Azure Resources And Budget Guardrail

- [ ] Dry-run bootstrap first.

```bash
npm run azure:bootstrap
```

- [ ] Apply the resource group, Azure OpenAI deployments, support resources,
budget guardrail, and Convex env.

```bash
npm run azure:bootstrap -- --apply --set-convex --budget-email "$AZURE_BUDGET_EMAIL"
```

Done when: Azure has the OpenAI account, `gpt5-agent`,
`arbor-judge-base`, `arbor-suggester-base`, and the Cost Management budget at
or below `$10,000`.

## 4. Wire Local, Hosted, And Coding-Tool Development

- [ ] Switch local `.env.local` to Azure OpenAI.

```bash
npm run azure:local -- azure-openai --apply
```

- [ ] Apply Convex env.

```bash
npm run azure:env -- convex --apply
```

- [ ] Apply Vercel env.

```bash
npm run azure:vercel -- azure-openai --apply --materialize-secret
```

- [ ] Generate OpenAI-compatible coding-tool env.

```bash
npm run azure:env -- devtools --format dotenv --output .env.azure-devtools --materialize-secret
```

- [ ] Smoke test the app and coding-tool routes.

```bash
npm run model:smoke -- agent
npm run azure:devtools:smoke -- --env-file .env.azure-devtools
```

Done when: both smoke tests call Azure successfully.

## 5. Fine-Tune Judge And Suggester

- [ ] Rebuild and validate local data.

```bash
npm run ft:data
npm run ft:validate
npm run ft:eval
```

- [ ] Submit the Azure fine-tune jobs.

```bash
npm run azure:ft:pipeline -- start --apply
```

- [ ] Poll job status until both roles complete.

```bash
npm run azure:ft:pipeline -- status
```

- [ ] Deploy both fine-tuned models.

```bash
npm run azure:ft:pipeline -- deploy --apply
```

- [ ] Switch Arbor runtime env to the fine-tuned deployments.

```bash
AZURE_OPENAI_JUDGE_DEPLOYMENT=arbor-judge \
AZURE_OPENAI_SUGGESTER_DEPLOYMENT=arbor-suggester \
npm run azure:env -- convex --apply

AZURE_OPENAI_JUDGE_DEPLOYMENT=arbor-judge \
AZURE_OPENAI_SUGGESTER_DEPLOYMENT=arbor-suggester \
npm run azure:vercel -- azure-openai --apply --materialize-secret
```

- [ ] Run live held-out evals.

```bash
npm run ft:eval -- judge --live --output data/fine-tuning/eval-report.judge-live.json
npm run ft:eval -- suggester --live --output data/fine-tuning/eval-report.suggester-live.json
```

Done when: `data/fine-tuning/azure-finetune-manifest.json` records successful
jobs and deployments, and live held-out eval reports are written.

## 6. Final Readiness

- [ ] Run strict readiness without paid smoke first.

```bash
npm run azure:ready
```

- [ ] Run paid smoke readiness.

```bash
npm run azure:ready -- --smoke
```

Done when: full readiness passes and reports the GPT-5 agent deployment plus
fine-tuned judge/suggester deployments.

## 7. Off Switch Drill

- [ ] Dry-run the soft off switch.

```bash
npm run azure:off -- --vercel
```

- [ ] Apply soft off when you need to stop model calls.

```bash
npm run azure:local -- off --apply
npm run azure:off -- --apply --vercel
npm run azure:off -- --verify
```

- [ ] Dry-run hard off for standing Azure charges.

```bash
npm run azure:off -- --delete-resource-group --resource-group arbor-ai-rg
```

- [ ] Apply hard off only when you are ready to delete the Arbor Azure resource group.

```bash
npm run azure:off -- --apply --delete-resource-group --resource-group arbor-ai-rg --confirm-resource-group arbor-ai-rg
```

Done when: soft off verification passes, or for hard off Azure reports
`arbor-ai-rg` no longer exists.

## Known Current Blockers

- Azure CLI is not installed in this local environment.
- Azure login/subscription cannot be verified yet.
- The Azure Foundry MCP tool is not exposed in this thread, so live Foundry
state must be verified through Azure CLI/scripts for now.
