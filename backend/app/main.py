
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.routes.alerts import router as alerts_router
from backend.app.api.routes.evacuation import router as evacuation_router
from backend.app.api.routes.locations import router as locations_router
from backend.app.api.routes.risk import router as risk_router
from backend.app.api.routes.rivers import router as rivers_router
from backend.app.api.routes.safe_places import router as safe_places_router
from backend.app.api.routes.safe_places_nearby import router as safe_places_nearby_router
from backend.app.api.routes.seismic import router as seismic_router
from backend.app.api.routes.weather import router as weather_router

app = FastAPI(
    title="FlashGuard API",
    description="Flash flood prediction and early-warning system API",
    version="1.0.0",
)

# Allow the React/Vite frontend to communicate with the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "https://flashguard-pi.vercel.app",
],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(locations_router)
app.include_router(risk_router)
app.include_router(rivers_router)
app.include_router(weather_router)
app.include_router(seismic_router)
app.include_router(safe_places_router)
app.include_router(safe_places_nearby_router)
app.include_router(alerts_router)
app.include_router(evacuation_router)


@app.get("/")
def root():
    return {
        "message": "FlashGuard API is running",
        "status": "DEMO",
    }


@app.get("/api/v1/health")
def health_check():
    return {
        "status": "ok",
        "service": "FlashGuard API",
        "data_status": "DEMO",
    }