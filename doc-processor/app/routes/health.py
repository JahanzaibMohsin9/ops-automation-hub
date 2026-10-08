import os
import shutil

from fastapi import APIRouter

from app.models.schemas import HealthResponse


router = APIRouter()


def _is_storage_configured() -> bool:
    required_keys = [
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET_NAME",
    ]
    return all(bool(os.getenv(key, "").strip()) for key in required_keys)


@router.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="doc-processor",
        tesseract_available=shutil.which("tesseract") is not None,
        storage_configured=_is_storage_configured(),
    )
