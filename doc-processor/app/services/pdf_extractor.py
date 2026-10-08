import io
from typing import Any

import fitz
import pdfplumber

from app.models.schemas import ExtractRequest, ExtractResponse, ExtractedPage
from app.services.ocr_processor import (
    extract_text_from_image_bytes,
    is_ocr_available,
)
from app.services.storage import download_storage_object


SUPPORTED_MIME_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/tiff",
}


class UnsupportedMimeTypeError(ValueError):
    pass


MIN_DIRECT_TEXT_LENGTH = 32


class ExtractionUnavailableError(ValueError):
    pass


def _normalize_text(value: str | None) -> str:
    if not value:
        return ""
    return value.replace("\x00", " ").strip()


def _render_pdf_page_for_ocr(page: fitz.Page) -> bytes:
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    return pixmap.tobytes("png")


def _extract_pdf_pages(file_bytes: bytes) -> ExtractResponse:
    pages: list[ExtractedPage] = []
    method_labels: set[str] = set()

    try:
        pdf_document = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as exc:  # pragma: no cover - library-specific parsing failures
        raise ExtractionUnavailableError("The PDF could not be opened for extraction.") from exc

    if pdf_document.needs_pass:
        pdf_document.close()
        raise ExtractionUnavailableError(
            "This PDF is password-protected and cannot be processed automatically."
        )

    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as plumber_document:
            for index, page in enumerate(pdf_document, start=1):
                warnings: list[str] = []
                metadata: dict[str, Any] = {
                    "source": "pymupdf",
                    "warnings": warnings,
                    "page_width": page.rect.width,
                    "page_height": page.rect.height,
                }

                direct_text = _normalize_text(page.get_text("text"))
                resolved_text = direct_text
                ocr_used = False
                page_source = "pymupdf"

                if len(direct_text) < MIN_DIRECT_TEXT_LENGTH:
                    metadata["pymupdf_char_count"] = len(direct_text)
                    try:
                        plumber_page = plumber_document.pages[index - 1]
                        plumber_text = _normalize_text(plumber_page.extract_text())
                    except Exception:
                        plumber_text = ""
                        warnings.append("pdfplumber_fallback_failed")

                    metadata["pdfplumber_char_count"] = len(plumber_text)

                    if len(plumber_text) > len(resolved_text):
                        resolved_text = plumber_text
                        page_source = "pdfplumber"

                    if len(resolved_text) < MIN_DIRECT_TEXT_LENGTH:
                        ocr_text = ""
                        if is_ocr_available():
                            try:
                                ocr_text = _normalize_text(
                                    extract_text_from_image_bytes(
                                        _render_pdf_page_for_ocr(page)
                                    )
                                )
                            except Exception:
                                warnings.append("ocr_failed")
                        else:
                            warnings.append("ocr_unavailable")

                        metadata["ocr_char_count"] = len(ocr_text)

                        if len(ocr_text) > len(resolved_text):
                            resolved_text = ocr_text
                            page_source = "ocr"
                            ocr_used = True

                metadata["source"] = page_source
                metadata["char_count"] = len(resolved_text)
                method_labels.add("ocr" if ocr_used else "pdf_text")

                pages.append(
                    ExtractedPage(
                        page_number=index,
                        text=resolved_text,
                        ocr_used=ocr_used,
                        metadata=metadata,
                    )
                )
    finally:
        pdf_document.close()

    if len(pages) == 0:
        raise ExtractionUnavailableError(
            "The PDF did not contain any readable pages."
        )

    extraction_method = "hybrid" if len(method_labels) > 1 else next(iter(method_labels), "pdf_text")
    return ExtractResponse(
        pages=pages,
        total_pages=len(pages),
        extraction_method=extraction_method,
    )


def _extract_image_document(file_bytes: bytes, mime_type: str) -> ExtractResponse:
    if not is_ocr_available():
        raise ExtractionUnavailableError(
            "Tesseract is unavailable and no OCR fallback is configured, so image documents cannot be processed yet."
        )

    warnings: list[str] = []
    ocr_text = _normalize_text(extract_text_from_image_bytes(file_bytes, mime_type))

    return ExtractResponse(
        pages=[
            ExtractedPage(
                page_number=1,
                text=ocr_text,
                ocr_used=True,
                metadata={
                    "source": "ocr",
                    "char_count": len(ocr_text),
                    "warnings": warnings,
                },
            )
        ],
        total_pages=1,
        extraction_method="ocr",
    )


def extract_document(payload: ExtractRequest) -> ExtractResponse:
    if payload.mime_type not in SUPPORTED_MIME_TYPES:
        raise UnsupportedMimeTypeError(
            f"Unsupported mime type '{payload.mime_type}'. Expected one of: {', '.join(sorted(SUPPORTED_MIME_TYPES))}."
        )

    file_bytes = download_storage_object(payload.storage_key)

    if payload.mime_type == "application/pdf":
        return _extract_pdf_pages(file_bytes)

    return _extract_image_document(file_bytes, payload.mime_type)
