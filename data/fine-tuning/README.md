# Arbor Fine-Tuning Data

Generated with:

```bash
npm run ft:data
npm run ft:validate
npm run ft:eval
```

The suggester dataset is built from `eval/router-bench/*` gold labels. The judge
dataset starts with curated accept/reject marketplace examples. Regenerate after
adding router tasks or real judged outcomes.

Each role has train, validation, and held-out test files. Training uses only
`*.train.jsonl` and `*.validation.jsonl`; `*.test.jsonl` is reserved for base
vs fine-tuned evaluation. `npm run ft:eval -- --live` runs the held-out set
against the currently configured Arbor model provider.

`ft:validate` also enforces minimum split sizes: at least 10 training examples,
2 validation examples, and 2 held-out test examples per role. This keeps the
Azure fine-tune pipeline from accepting a placeholder-sized judge or suggester
corpus.

Azure pipeline:

```bash
npm run azure:ft:pipeline -- start --apply
npm run azure:ft:pipeline -- status
npm run azure:ft:pipeline -- deploy --apply
```

The applied run writes `azure-finetune-manifest.json`. The checked-in
`azure-finetune-manifest.example.json` documents the expected manifest shape.
`validation-report.json` and `eval-report.json` are local generated reports and
are ignored by git.

If validation or eval fails, inspect the generated report for the first failing
example, fix the source examples or router tasks, then rerun:

```bash
npm run ft:data
npm run ft:validate
npm run ft:eval
```
