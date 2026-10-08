# Python Document Processor Contract

This document defines the contract between the Next.js and Trigger.dev codebase and the Python document-processing service.

## Purpose

The Python service owns:

- PDF text extraction
- OCR fallback for scanned pages and image files
- page-level extraction metadata
- a stable API for the Trigger.dev document pipeline

## Runtime assumptions

- Service framework: FastAPI
- Default local base URL: `http://localhost:8000`
- Auth mechanism: bearer token using `PYTHON_EXTRACTOR_TOKEN`
- Storage access model: the service resolves the incoming `storage_key` against the shared R2 bucket credentials

## Endpoints

### `GET /health`

Used by local dev, Docker health checks, and deployment probes.

#### Response

```json
{
  "status": "ok",
  "service": "doc-processor",
  "tesseract_available": true,
  "storage_configured": true
}
```

### `POST /extract`

Runs document extraction for a single uploaded file.

#### Request headers

- `Authorization: Bearer <PYTHON_EXTRACTOR_TOKEN>`

#### Request body

```json
{
  "storage_key": "workspace_123/documents/abc123.pdf",
  "mime_type": "application/pdf"
}
```

#### Success response

```json
{
  "pages": [
    {
      "page_number": 1,
      "text": "Invoice #1001",
      "ocr_used": false,
      "metadata": {
        "char_count": 13,
        "source": "pdf_text",
        "warnings": []
      }
    }
  ],
  "total_pages": 1,
  "extraction_method": "pdf_text"
}
```

## Response semantics

- `pages` must contain one entry per extracted page or image frame
- `page_number` is 1-based
- `text` is plain UTF-8 text
- `ocr_used` indicates whether OCR was needed for that page
- `metadata` is reserved for page-level diagnostics such as source, confidence hints, dimensions, rotation, and warnings
- `total_pages` must equal `pages.length`
- `extraction_method` is a top-level summary such as `pdf_text`, `ocr`, or `hybrid`

## Error semantics

### `400 Bad Request`

- unsupported mime type
- malformed payload

### `401 Unauthorized`

- missing or invalid bearer token

### `404 Not Found`

- storage object does not exist for the given `storage_key`

### `422 Unprocessable Entity`

- file exists but extraction cannot proceed because the document is corrupted or unreadable

### `500 Internal Server Error`

- unexpected extraction failure

Error responses should be JSON in this shape:

```json
{
  "error": {
    "code": "storage_object_missing",
    "message": "No object was found for the provided storage key."
  }
}
```

## Supported mime types

- `application/pdf`
- `image/png`
- `image/jpeg`
- `image/tiff`

## Non-goals for the initial contract

- batch extraction
- async callbacks from the Python service
- direct database writes from the Python service
- schema-level business extraction in the same endpoint

## Trigger.dev integration notes

The Node side should treat the service as a synchronous extraction dependency inside a Trigger.dev task:

1. Fetch the document record and storage key.
2. Call `POST /extract`.
3. Persist `DocumentPage` rows from the response.
4. Advance the document status based on whether OCR was used and whether extraction succeeded.

## Local development

Use the scaffold in [`doc-processor/`](../doc-processor) and start it with:

```bash
docker compose -f docker-compose.doc-processor.yml up --build
```
