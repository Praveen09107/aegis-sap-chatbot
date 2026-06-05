"""
AEGIS DeBERTa NLI and Cross-Encoder Service
Provides NLI entailment scoring (Tier 2 validation) and
cross-encoder reranking (Stage 7 of retrieval pipeline).
"""
import os
import logging
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import pipeline
from sentence_transformers import CrossEncoder

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

NLI_MODEL_NAME = os.getenv("NLI_MODEL_NAME", "cross-encoder/nli-deberta-v3-large")
RERANKER_MODEL_NAME = os.getenv("RERANKER_MODEL_NAME", "cross-encoder/ms-marco-MiniLM-L-12-v2")

# Global model instances
nli_pipeline = None
reranker_model: CrossEncoder = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global nli_pipeline, reranker_model
    logger.info(f"Loading NLI model: {NLI_MODEL_NAME}")
    nli_pipeline = pipeline(
        "zero-shot-classification",
        model=NLI_MODEL_NAME,
        device=-1  # CPU
    )
    logger.info(f"Loading reranker model: {RERANKER_MODEL_NAME}")
    reranker_model = CrossEncoder(RERANKER_MODEL_NAME, max_length=512)
    logger.info("NLI and reranker models loaded")
    yield
    nli_pipeline = None
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
    if nli_pipeline is None or reranker_model is None:
        raise HTTPException(status_code=503, detail="Models not loaded")
    return {"status": "healthy", "nli_model": NLI_MODEL_NAME, "reranker_model": RERANKER_MODEL_NAME}


@app.post("/nli", response_model=NLIResponse)
async def nli_evaluate(request: NLIRequest):
    """
    Evaluate whether each premise entails the hypothesis.
    Returns ENTAILMENT, NEUTRAL, CONTRADICTION scores for each premise.
    """
    if nli_pipeline is None:
        raise HTTPException(status_code=503, detail="NLI model not loaded")
    if not request.hypothesis.strip():
        raise HTTPException(status_code=400, detail="hypothesis cannot be empty")
    if not request.premises:
        raise HTTPException(status_code=400, detail="premises list cannot be empty")

    scores = []
    max_entailment = 0.0

    for i, premise in enumerate(request.premises):
        if not premise.strip():
            scores.append(NLIScore(premise_index=i, entailment=0.0, neutral=1.0, contradiction=0.0))
            continue

        result = nli_pipeline(
            premise,
            candidate_labels=[request.hypothesis],
            hypothesis_template="{}",
            multi_label=False
        )

        # The nli_pipeline for zero-shot returns label-score pairs
        # We map to entailment/neutral/contradiction
        label_scores = dict(zip(result["labels"], result["scores"]))

        # For NLI deberta: entailment = 1 (true), neutral = 0.5 (uncertain), contradiction = 0 (false)
        # Use the top label as entailment indicator
        top_label = result["labels"][0]
        top_score = result["scores"][0]

        if top_label.lower() in ["entailment", "true", "yes"]:
            ent_score = top_score
            neut_score = result["scores"][1] if len(result["scores"]) > 1 else 0.0
            cont_score = result["scores"][2] if len(result["scores"]) > 2 else 0.0
        elif top_label.lower() in ["neutral", "uncertain"]:
            ent_score = result["scores"][2] if len(result["scores"]) > 2 else 0.0
            neut_score = top_score
            cont_score = result["scores"][1] if len(result["scores"]) > 1 else 0.0
        else:
            ent_score = result["scores"][2] if len(result["scores"]) > 2 else 0.0
            neut_score = result["scores"][1] if len(result["scores"]) > 1 else 0.0
            cont_score = top_score

        score = NLIScore(
            premise_index=i,
            entailment=round(ent_score, 4),
            neutral=round(neut_score, 4),
            contradiction=round(cont_score, 4)
        )
        scores.append(score)
        max_entailment = max(max_entailment, ent_score)

    return NLIResponse(scores=scores, max_entailment=round(max_entailment, 4))


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
