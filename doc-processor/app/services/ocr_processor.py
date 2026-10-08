import io
import base64
import json
import os
import shutil
import urllib.error
import urllib.request
from pathlib import Path

import pytesseract
from PIL import Image


COMMON_WINDOWS_TESSERACT_PATHS = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
)


def _find_tesseract_command() -> str | None:
    configured_path = (
        os.getenv("TESSERACT_CMD", "").strip()
        or os.getenv("TESSERACT_PATH", "").strip()
    )
    candidates = [
        configured_path,
        shutil.which("tesseract") or "",
        *COMMON_WINDOWS_TESSERACT_PATHS,
    ]

    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate

    return None


def is_tesseract_available() -> bool:
    return _find_tesseract_command() is not None


def _has_openai_ocr_fallback() -> bool:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    return api_key.startswith("sk-") and api_key != "sk-replace_me"


def is_ocr_available() -> bool:
    return is_tesseract_available() or _has_openai_ocr_fallback()


def _extract_output_text(response: dict) -> str:
    output_text = response.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    chunks: list[str] = []
    for item in response.get("output", []):
        if not isinstance(item, dict):
            continue
        for content_item in item.get("content", []):
            if (
                isinstance(content_item, dict)
                and content_item.get("type") == "output_text"
                and isinstance(content_item.get("text"), str)
            ):
                chunks.append(content_item["text"])

    return "".join(chunks).strip()


def _extract_text_with_tesseract(image_bytes: bytes) -> str:
    tesseract_command = _find_tesseract_command()
    if not tesseract_command:
        return ""

    pytesseract.pytesseract.tesseract_cmd = tesseract_command

    with Image.open(io.BytesIO(image_bytes)) as image:
        return pytesseract.image_to_string(image).strip()


def _extract_text_with_openai_vision(image_bytes: bytes, mime_type: str) -> str:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    model = os.getenv("OPENAI_OCR_MODEL", "gpt-5-mini").strip() or "gpt-5-mini"
    image_data_url = (
        f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode('ascii')}"
    )
    payload = {
        "model": model,
        "input": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Extract all visible text from this business document. "
                            "Preserve line breaks and reading order. Return only the extracted text."
                        ),
                    },
                    {
                        "type": "input_image",
                        "image_url": image_data_url,
                        "detail": "high",
                    },
                ],
            }
        ],
    }
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            parsed = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI OCR fallback failed: {exc.code} {body}") from exc

    return _extract_output_text(parsed)


def extract_text_from_image_bytes(image_bytes: bytes, mime_type: str = "image/png") -> str:
    try:
        tesseract_text = _extract_text_with_tesseract(image_bytes)
    except Exception:
        if not _has_openai_ocr_fallback():
            raise
        tesseract_text = ""

    if tesseract_text or not _has_openai_ocr_fallback():
        return tesseract_text

    return _extract_text_with_openai_vision(image_bytes, mime_type)
