"""AEGIS API Request/Response Models (Pydantic)."""
from typing import Optional, List
from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


class FeedbackRequest(BaseModel):
    session_id: str
    turn_index: int
    signal: str


class UploadResponse(BaseModel):
    status: str
    document_id: Optional[str] = None
    chunk_count: Optional[int] = None
    message: str


class AttributionPanelData(BaseModel):
    primary_document_id: str
    primary_document_name: str
    verified_by: str
    verified_date: str
    secondary_sources: List[dict] = []
    confidence_badge: str


class ChatResponse(BaseModel):
    session_id: str
    answer: str
    confidence_badge: str
    attribution: Optional[dict] = None


class WebSocketMessage(BaseModel):
    type: str
    message: Optional[str] = None
    session_id: Optional[str] = None
    token: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    services: dict
