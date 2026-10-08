# Document Processor

This folder contains the FastAPI document extraction service used by the Trigger.dev document pipeline.

## Included

- FastAPI app structure
- `/health` endpoint
- `/extract` endpoint with bearer-token auth
- R2 object download support
- PDF extraction with PyMuPDF, `pdfplumber`, and OCR fallback
- image extraction through Tesseract OCR
- Dockerfile with Tesseract installed
- requirements pinned for the expected extraction stack

## Local run

```bash
docker compose -f ../docker-compose.doc-processor.yml up --build
```

Or from the repo root:

```bash
docker compose -f docker-compose.doc-processor.yml up --build
```

The service expects these environment variables:

- `PYTHON_EXTRACTOR_TOKEN`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`

## Endpoints

- `GET /health` returns service status, Tesseract availability, and whether R2 storage is configured.
- `POST /extract` accepts:

```json
{
  "storage_key": "workspaces/<workspace-id>/documents/<date>/<file>",
  "mime_type": "application/pdf"
}
```

Successful responses return page-level text, OCR usage flags, and extraction metadata. For PDFs, the service tries PyMuPDF first, falls back to `pdfplumber` on low-text pages, and finally uses Tesseract OCR when needed.

## Notes

- Supported mime types: PDF, PNG, JPEG, and TIFF
- OCR requires `tesseract` to be available in the runtime image
- The current extractor reads directly from the shared R2 bucket using the same credentials configured for the app
