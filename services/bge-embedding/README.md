# BGE Embedding Service

**Model:** BAAI/bge-base-en-v1.5
**Output dimensions:** 768 (dense vector)
**Port:** 8002
**Container name:** aegis-bge

## API

POST /embed
Body: {"texts": ["text1", "text2"]}
Returns: {"embeddings": [[0.1, 0.2, ...], ...]}

POST /embed-single
Body: {"text": "single text"}
Returns: {"embedding": [0.1, 0.2, ...]}

GET /health
Returns: {"status": "healthy", "model": "bge-base-en-v1.5", "dim": 768}

## Notes
- Implemented in IMPL_04
- Dockerfile in IMPL_03
- Called by retrieval_engine.py and process_form_entry.py ARQ task
