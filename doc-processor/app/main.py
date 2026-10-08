from fastapi import FastAPI

from app.routes.extract import router as extract_router
from app.routes.health import router as health_router


app = FastAPI(title="Ops Automation Document Processor", version="0.1.0")
app.include_router(health_router)
app.include_router(extract_router)
