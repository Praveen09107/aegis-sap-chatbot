"""
AEGIS DeBERTa NLI and Cross-Encoder Service
Provides NLI entailment scoring (Tier 2 validation) and
cross-encoder reranking (Stage 7 of retrieval pipeline).
"""
import os
import logging
from contextlib import asynccontextmanager
from typing import List, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import CrossEncoder

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

NLI_MODEL_NAME = os.getenv("NLI_MODEL_NAME", "cross-encoder/nli-deberta-v3-large")
RERANKER_MODEL_NAME = os.getenv("RERANKER_MODEL_NAME", "cross-encoder/ms-marco-MiniLM-L-12-v2")

# Label order for cross-encoder/nli-deberta-v3-large
NLI_LABELS = ["contradiction", "entailment", "neutral"]

# Global model instances
nli_model: CrossEncoder = None
reranker_model: CrossEncoder = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global nli_model, reranker_model
    logger.info(f"Loading NLI model: {NLI_MODEL_NAME}")
    nli_model = CrossEncoder(NLI_MODEL_NAME, max_length=512)
    logger.info(f"Loading reranker model: {RERANKER_MODEL_NAME}")
    reranker_model = CrossEncoder(RERANKER_MODEL_NAME, max_length=512)
    logger.info("NLI and reranker models loaded")
    yield
    nli_model = None
    reranker_model = None


app = FastAPI(title="AEGIS DeBERTa NLI Service", version="1.0.0", lifespan=lifespan)


class NLIRequest(BaseModel):
    hypothesis: str
    premises: List[str]  # Each premise must be max 350 tokens


class NLIScore(BaseModel):
    premise_index: int
    entailment: float
    neutral: float
    contradiction: float


class NLIResponse(BaseModel):
    scores: List[NLIScore]
    max_entailment: float
    label: str
    score: float


class NLIPair(BaseModel):
    hypothesis: str
    premise: str


class NLIBatchRequest(BaseModel):
    pairs: List[NLIPair]


class NLIBatchResult(BaseModel):
    entailment: float
    neutral: float
    contradiction: float


class NLIBatchResponse(BaseModel):
    results: List[NLIBatchResult]


class RerankRequest(BaseModel):
    query: str
    passages: List[str]


class RerankResponse(BaseModel):
    scores: List[float]


@app.get("/health")
async def health():
    if nli_model is None or reranker_model is None:
        raise HTTPException(status_code=503, detail="Models not loaded")
    return {"status": "healthy", "nli_model": NLI_MODEL_NAME, "reranker_model": RERANKER_MODEL_NAME}


@app.post("/nli", response_model=NLIResponse)
async def nli_evaluate(request: NLIRequest):
    """
    Evaluate whether each premise entails the hypothesis.
    Returns ENTAILMENT, NEUTRAL, CONTRADICTION scores for each premise.
    Also returns top-level label (highest scoring NLI class) and its score.
    """
    if nli_model is None:
        raise HTTPException(status_code=503, detail="NLI model not loaded")
    if not request.hypothesis.strip():
        raise HTTPException(status_code=400, detail="hypothesis cannot be empty")
    if not request.premises:
        raise HTTPException(status_code=400, detail="premises list cannot be empty")

    pairs = [(premise, request.hypothesis) for premise in request.premises]
    # CrossEncoder returns logits with shape (n_pairs, 3)
    # Label order: [contradiction, entailment, neutral]
    logits = nli_model.predict(pairs, show_progress_bar=False)
    if logits.ndim == 1:
        logits = logits.reshape(1, -1)

    scores = []
    max_entailment = 0.0

    for i, row in enumerate(logits):
        # Softmax to get probabilities
        exp_row = np.exp(row - np.max(row))
        probs = exp_row / exp_row.sum()

        cont_score = float(probs[0])
        ent_score = float(probs[1])
        neut_score = float(probs[2])

        score = NLIScore(
            premise_index=i,
            entailment=round(ent_score, 4),
            neutral=round(neut_score, 4),
            contradiction=round(cont_score, 4),
        )
        scores.append(score)
        max_entailment = max(max_entailment, ent_score)

    # Top-level label: highest scoring NLI class across all premises
    # Use the premise with the highest entailment for the overall label
    best_premise = max(scores, key=lambda s: s.entailment)
    label_scores = {
        "entailment": best_premise.entailment,
        "neutral": best_premise.neutral,
        "contradiction": best_premise.contradiction,
    }
    top_label = max(label_scores, key=label_scores.get)
    top_score = label_scores[top_label]

    return NLIResponse(
        scores=scores,
        max_entailment=round(max_entailment, 4),
        label=top_label,
        score=round(top_score, 4),
    )


@app.post("/rerank", response_model=RerankResponse)
async def rerank_passages(request: RerankRequest):
    """
    Score query-passage pairs using ms-marco-MiniLM-L-12-v2.
    Used by the Retrieval Engine Stage 7 (cross-encoder reranking).
    """
    if reranker_model is None:
        raise HTTPException(status_code=503, detail="Reranker model not loaded")
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="query cannot be empty")
    if not request.passages:
        raise HTTPException(status_code=400, detail="passages list cannot be empty")

    pairs = [[request.query, passage] for passage in request.passages]
    scores = reranker_model.predict(pairs, show_progress_bar=False)

    # Convert numpy float32 to Python float
    return RerankResponse(scores=[round(float(s), 4) for s in scores])
