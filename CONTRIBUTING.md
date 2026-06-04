# Contributing to AEGIS

## Branch Naming Convention

```
session/impl-01-dependencies
session/impl-02-env-setup
session/impl-03-docker
session/impl-04-models
...
session/impl-23-quickentry-overview
session/impl-24-quickentry-data-model
session/impl-25-quickentry-api
session/impl-26-quickentry-pipeline
session/impl-27-quickentry-chunker
session/impl-28-quickentry-screenshots
session/impl-29-quickentry-operations
session/frontend-01-11-core
session/frontend-12-15-employee
session/frontend-16-22-admin
session/frontend-36-40-quickentry
```

## Commit Message Format

```
Session N: IMPL_XX — short description of what was built

- specific component 1 created
- specific component 2 created
- tests added for component X
- verified: all existing tests still pass
```

Example:
```
Session 4: IMPL_04 — AI models setup complete

- BGE embedding service verified (768-dim vectors)
- DeBERTa NLI service verified (entailment labels correct)
- All 3 Ollama models verified via API
- model_info.txt written with exact model tags
```

## Workflow

1. Pull latest dev: `git checkout dev && git pull origin dev`
2. Create session branch: `git checkout -b session/impl-XX-description`
3. Run agent with the spec document
4. Review all created files
5. Run verification commands from the spec
6. Commit: `git add -A && git commit -m "Session N: IMPL_XX — ..."`
7. Push: `git push -u origin session/impl-XX-description`
8. After review, merge to dev: `git checkout dev && git merge session/impl-XX-description`

## Never Do

- Never commit directly to `main`
- Never commit `.env` or any file containing real credentials
- Never skip the verification commands at the end of each spec
- Never create files the agent should create — let the agent write all source code
