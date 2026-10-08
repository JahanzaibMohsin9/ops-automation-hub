import os

from fastapi import APIRouter, Header, status
from fastapi.responses import JSONResponse

from app.models.schemas import ErrorResponse, ExtractRequest, ExtractResponse
from app.services.pdf_extractor import (
    ExtractionUnavailableError,
    UnsupportedMimeTypeError,
    extract_document,
)
from app.services.storage import StorageObjectMissingError


router = APIRouter()


def _error_response(
    status_code: int,
    code: str,
    message: str,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
    )


def _validate_bearer_token(authorization: str | None) -> JSONResponse | None:
    expected = os.getenv("PYTHON_EXTRACTOR_TOKEN", "").strip()

    if not expected:
        return _error_response(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "extractor_token_missing",
            "PYTHON_EXTRACTOR_TOKEN is not configured.",
        )

    if not authorization or not authorization.startswith("Bearer "):
        return _error_response(
            status.HTTP_401_UNAUTHORIZED,
            "unauthorized",
            "Missing bearer token.",
        )

    presented = authorization.removeprefix("Bearer ").strip()

    if presented != expected:
        return _error_response(
            status.HTTP_401_UNAUTHORIZED,
            "unauthorized",
            "Invalid bearer token.",
        )

    return None


@router.post(
    "/extract",
    response_model=ExtractResponse,
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
)
def extract(
    payload: ExtractRequest,
    authorization: str | None = Header(default=None),
) -> ExtractResponse | JSONResponse:
    auth_error = _validate_bearer_token(authorization)
    if auth_error is not None:
        return auth_error

    try:
        return extract_document(payload)
    except UnsupportedMimeTypeError as exc:
        return _error_response(
            status.HTTP_400_BAD_REQUEST,
            "unsupported_mime_type",
            str(exc),
        )
    except StorageObjectMissingError as exc:
        return _error_response(
            status.HTTP_404_NOT_FOUND,
            "storage_object_missing",
            str(exc),
        )
    except ExtractionUnavailableError as exc:
        return _error_response(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "extraction_not_ready",
            str(exc),
        )
    except ValueError as exc:
        return _error_response(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "invalid_extraction_request",
            str(exc),
        )
    except Exception:
        return _error_response(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "extraction_failed",
            "The document processor encountered an unexpected extraction failure.",
        )
