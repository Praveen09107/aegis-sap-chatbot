# DeBERTa NLI Service

**Model:** cross-encoder/nli-deberta-v3-large
**Task:** Natural Language Inference (entailment validation)
**Port:** 8001
**Container name:** aegis-deberta

## API

POST /nli
Body: {"premise": "source text", "hypothesis": "claim to verify"}
Returns: {"label": "entailment|neutral|contradiction", "score": 0.95}

GET /health
Returns: {"status": "healthy", "model": "nli-deberta-v3-large"}

## Notes
- Implemented in IMPL_04
- Dockerfile in IMPL_03
- Called by validation_engine.py Tier 2 NLI check
