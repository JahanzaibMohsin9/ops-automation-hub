from typing import Any

from pydantic import BaseModel, Field


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


class ExtractRequest(BaseModel):
    storage_key: str = Field(min_length=1)
    mime_type: str = Field(min_length=1)


class ExtractedPage(BaseModel):
    page_number: int = Field(ge=1)
    text: str
    ocr_used: bool
    metadata: dict[str, Any]


class ExtractResponse(BaseModel):
    pages: list[ExtractedPage]
    total_pages: int = Field(ge=0)
    extraction_method: str


class HealthResponse(BaseModel):
    status: str
    service: str
    tesseract_available: bool
    storage_configured: bool
