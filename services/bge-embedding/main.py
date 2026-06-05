"""
AEGIS BGE Embedding Service
Wraps BAAI/bge-base-en-v1.5 as a FastAPI inference endpoint.
Produces 768-dimensional dense vectors.
"""
import os
import logging
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

MODEL_NAME = os.getenv("MODEL_NAME", "BAAI/bge-base-en-v1.5")
EMBEDDING_DIMENSION = 768

# Global model instance
model: SentenceTransformer = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model at startup, release at shutdown."""
    global model
    logger.info(f"Loading embedding model: {MODEL_NAME}")
    model = SentenceTransformer(MODEL_NAME)
    # Warm up the model with a test embedding
    _ = model.encode(["warm up"], normalize_embeddings=True)
    logger.info(f"Embedding model loaded. Dimension: {EMBEDDING_DIMENSION}")
    yield
    logger.info("Embedding service shutting down")
    model = None


app = FastAPI(title="AEGIS BGE Embedding Service", version="1.0.0", lifespan=lifespan)


class EmbedRequest(BaseModel):
    texts: List[str]


class EmbedSingleRequest(BaseModel):
    text: str


class EmbedResponse(BaseModel):
    embeddings: List[List[float]]
    dimension: int


class EmbedSingleResponse(BaseModel):
    embedding: List[float]
    dimension: int


@app.get("/health")
async def health():
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {"status": "healthy", "model": MODEL_NAME, "dimension": EMBEDDING_DIMENSION}


@app.post("/embed", response_model=EmbedResponse)
async def embed_batch(request: EmbedRequest):
    """Embed a batch of texts. Returns 768-dim vectors."""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    if not request.texts:
        raise HTTPException(status_code=400, detail="texts list cannot be empty")
    if len(request.texts) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 texts per batch")

    embeddings = model.encode(
        request.texts,
        normalize_embeddings=True,
        show_progress_bar=False
    )
    return EmbedResponse(
        embeddings=embeddings.tolist(),
        dimension=EMBEDDING_DIMENSION
    )


@app.post("/embed-single", response_model=EmbedSingleResponse)
async def embed_single(request: EmbedSingleRequest):
    """Embed a single text. Returns one 768-dim vector."""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="text cannot be empty")

    embedding = model.encode(
        [request.text],
        normalize_embeddings=True,
        show_progress_bar=False
    )[0]
    return EmbedSingleResponse(
        embedding=embedding.tolist(),
        dimension=EMBEDDING_DIMENSION
    )
