"""FlashGuard ML predictor service (Phase 6).

Production artifact: ``ml/models/rf_calibrated_baseline_v1.joblib`` — the v1
calibrated Random Forest baseline (9 canonical features). The v2 baseline
(``rf_calibrated_baseline_v2.joblib``, 11-feature contract) is preserved as a
validated research experiment and is NOT loaded for live predictions.

Contract
========
* Input: the canonical RAW feature vector produced by
  :func:`backend.app.risk_engine.features.build_features` (or
  ``live_feature_vector``). The service applies the shared ``transform_vector``
  itself, so callers must NOT pre-transform (pass ``model_input`` output and the
  rainfall features would be log-transformed twice).
* The required feature set is always the **loaded artifact's own declared
  feature list** (9 for the v1 production artifact); canonical features outside
  that list (slope/aspect/river) are reported but never block a prediction.
* Output: a dict with
    - ``probability_pct``: calibrated probability as a float 0-100,
    - ``risk_level``: one of the existing bands
      LOW 0-<30, MODERATE 30-<60, HIGH 60-<80, CRITICAL 80-100,
    - ``contributing_factors``: top model inputs by learned feature importance,
      annotated with the input's own value and unit,
    - ``model``: artifact identifier/version,
    - ``model_status`` / ``data_status``: honest status labels.

Honesty rules (non-negotiable)
==============================
* Missing features are NEVER fabricated or imputed. A prediction requires every
  feature the loaded artifact was trained on (the v1 production artifact needs
  its 9 canonical features; the optional ``river_distance_m`` is excluded and
  never blocks a prediction). Incomplete input -> "DATA_INCOMPLETE" with the
  exact missing list.
* A missing or corrupt artifact -> "MODEL_UNAVAILABLE". Prediction further
  degrades to an honest "UNAVAILABLE" result; no demo-scenario probability is
  ever substituted.
* Output never claims safety, and never claims production readiness — the
  artifact is a research baseline.
"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from backend.app.risk_engine.features import (
    FEATURE_NAMES,
    build_features,
    feature_units,
    transform_vector,
)

# Existing risk bands, expressed as probability percent.
RISK_BANDS: tuple[tuple[str, float, float], ...] = (
    ("LOW", 0.0, 30.0),
    ("MODERATE", 30.0, 60.0),
    ("HIGH", 60.0, 80.0),
    ("CRITICAL", 80.0, 100.0),
)
_MODEL_DIR = Path(__file__).resolve().parents[3] / "ml" / "models"
_ARTIFACT_NAME = "rf_calibrated_baseline_v1.joblib"
DEFAULT_ARTIFACT_PATH: Path = Path(
    os.environ.get("FLASHGUARD_MODEL_PATH") or (_MODEL_DIR / _ARTIFACT_NAME)
)

_TOP_FACTORS = 3


class PredictorError(Exception):
    """Raised when the model artifact is missing, corrupt, or incompatible."""


@dataclass(frozen=True)
class LoadedModel:
    model: Any
    version: str
    label: str
    artifact_path: str
    importance: dict[str, float] | None
    feature_names: tuple[str, ...]


_loaded_model: LoadedModel | None = None
_configured_path: Path | None = None


# ─── Model loading ───────────────────────────────────────────────────────

def _effective_path(path: Path | str | None) -> Path:
    return Path(path) if path is not None else _configured_path or DEFAULT_ARTIFACT_PATH


def configure(path: Path | str | None = None) -> None:
    """Set the artifact path and drop any cached model (used by tests/ops)."""
    global _configured_path, _loaded_model
    _configured_path = None if path is None else Path(path)
    _loaded_model = None


def _extract_importance(model: Any, feature_names: tuple[str, ...]) -> dict[str, float] | None:
    """Best-effort global feature importances from the calibrated RFC.

    For a CalibratedClassifierCV the fitted base estimator lives in
    ``calibrated_classifiers_[0].estimator``. Importances are aligned to the
    artifact's own declared ``feature_names``. If any step fails, return None
    (attribution simply becomes unavailable — still honest).
    """
    base: Any = model
    for collection in ("calibrated_classifiers_",):
        classifiers = getattr(model, collection, None)
        if classifiers:
            try:
                base = classifiers[0].estimator
            except AttributeError:
                base = getattr(classifiers[0], "base_estimator", None)
            break
    importances = getattr(base, "feature_importances_", None)
    if importances is None or len(importances) != len(feature_names):
        return None
    total = float(np.sum(importances))
    if not math.isfinite(total) or total <= 0:
        return None
    return {
        name: float(value) / total
        for name, value in zip(feature_names, importances, strict=True)
    }


def load_model(path: Path | str | None = None) -> LoadedModel:
    """Load and validate the artifact; raises PredictorError on any problem."""
    target = _effective_path(path)
    if not target.exists():
        raise PredictorError(f"model artifact not found: {target}")
    try:
        payload = joblib.load(target)
    except BaseException as exc:  # noqa: BLE001 - pickle/joblib raise many types
        raise PredictorError(f"model artifact corrupt or unreadable: {target}: {exc}") from exc
    if not isinstance(payload, dict):
        raise PredictorError(f"model artifact has an invalid payload shape: {target}")
    model = payload.get("model")
    if model is None or not callable(getattr(model, "predict_proba", None)):
        raise PredictorError(f"model artifact has no usable predict_proba: {target}")
    version = payload.get("version")
    if not isinstance(version, str) or not version:
        raise PredictorError(f"model artifact has no version identifier: {target}")
    stored_features = payload.get("feature_names")
    if not isinstance(stored_features, (tuple, list)) or not stored_features:
        raise PredictorError(f"model artifact declares no feature_names: {target}")
    canonical = set(FEATURE_NAMES)
    if not all(name in canonical for name in stored_features):
        raise PredictorError(
            f"model feature contract mismatch: artifact declares unknown features "
            f"outside the canonical schema: "
            f"{[name for name in stored_features if name not in canonical]}"
        )
    label = payload.get("artifact")
    stored = tuple(stored_features)
    return LoadedModel(
        model=model,
        version=version,
        label=label if isinstance(label, str) else "FlashGuard baseline RFC (calibrated)",
        artifact_path=str(target),
        importance=_extract_importance(model, stored),
        feature_names=stored,
    )


def get_model(path: Path | str | None = None) -> LoadedModel:
    """Return a cached LoadedModel, loading it (and validating) on first use."""
    global _loaded_model
    if _loaded_model is None:
        _loaded_model = load_model(path)
    elif path is not None and Path(path) != _loaded_model.artifact_path:
        _loaded_model = load_model(path)
    return _loaded_model


# ─── Risk-band mapping ───────────────────────────────────────────────────

def risk_level(pct: float) -> str:
    """Map a probability percent to the existing risk band."""
    value = min(100.0, max(0.0, float(pct)))
    for level, lower, upper in RISK_BANDS:
        if lower <= value < upper:
            return level
    return RISK_BANDS[-1][0]  # pct == 100.0 is CRITICAL


# ─── Contributing factors / explanation ──────────────────────────────────

def _factor_note(rank: int) -> str:
    if rank == 0:
        return "Primary model input by learned importance."
    if rank == 1:
        return "Secondary model input by learned importance."
    return "Tertiary model input by learned importance."


def contributing_factors(loaded: LoadedModel, canonical: dict) -> list[dict]:
    """Top model inputs by learned importance, annotated with the input values."""
    units = feature_units()
    if loaded.importance is None:
        return [
            {
                "feature": name,
                "value": canonical.get(name),
                "unit": units.get(name),
                "importance": None,
                "note": "No learned per-feature attribution available for this artifact.",
            }
            for name, _ in list(loaded.feature_names)[: _TOP_FACTORS]
        ]
    ranked = sorted(
        loaded.importance.items(),
        key=lambda item: item[1],
        reverse=True,
    )
    return [
        {
            "feature": name,
            "value": canonical.get(name),
            "unit": units.get(name),
            "importance": round(value, 4),
            "note": _factor_note(rank),
        }
        for rank, (name, value) in enumerate(ranked[:_TOP_FACTORS])
    ]


# ─── Honest result builders ──────────────────────────────────────────────

def _unavailable(status_reason: str, detail: str, *,
                 model: LoadedModel | None = None,
                 missing_features: list[str] | None = None,
                 path: Path | None = None) -> dict:
    missing = missing_features or []
    if model is not None:
        model_block = {"version": model.version, "artifact": model.label, "loaded": True}
        model_status = "READY"
        data_status = "INCOMPLETE" if missing else "COMPLETE"
        shown_path = model.artifact_path
    else:
        model_block = {"version": None, "artifact": None, "loaded": False}
        model_status = "UNAVAILABLE"
        data_status = "UNAVAILABLE"
        shown_path = str(path) if path is not None else None
    return {
        "status": "UNAVAILABLE",
        "reason": status_reason,
        "detail": detail,
        "probability_pct": None,
        "risk_level": None,
        "contributing_factors": [],
        "explanation": f"No prediction available: {detail}",
        "model": model_block,
        "model_status": model_status,
        "data_status": data_status,
        "missing_features": missing,
        "model_path": shown_path,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "disclaimer": "Unavailable result. No demo-scenario probability is substituted.",
    }


def _ready(model: LoadedModel, canonical: dict, probability: float,
           missing: list[str]) -> dict:
    pct = round(min(100.0, max(0.0, float(probability) * 100.0)), 1)
    level = risk_level(pct)
    factors = contributing_factors(model, canonical)
    top = ", ".join(
        f"{f['feature']} ({f['value']}{f['unit']})" for f in factors
    ) or "no attribution available"
    return {
        "status": "PREDICTION",
        "reason": None,
        "detail": "Prediction from calibrated Random Forest baseline on complete canonical features.",
        "probability_pct": pct,
        "risk_level": level,
        "contributing_factors": factors,
        "explanation": (
            f"Calibrated RFC baseline version {model.version} estimates {pct}% "
            f"flood probability ({level}) from {len(model.feature_names)} complete "
            f"canonical features. Top inputs by learned importance: {top}."
        ),
        "model": {
            "version": model.version,
            "artifact": model.label,
            "loaded": True,
        },
        "model_status": "READY",
        "data_status": "COMPLETE" if not missing else "INCOMPLETE",
        "missing_features": missing,
        "model_path": model.artifact_path,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "disclaimer": (
            "Baseline research artifact; not a production prediction and not a "
            "substitute for official hydrological or emergency-authority warnings."
        ),
    }


# ─── Public service API ──────────────────────────────────────────────────

def predict(vector: dict, *, path: Path | str | None = None) -> dict:
    """Predict flood risk from a canonical RAW feature vector (see module doc).

    Never raises: missing/corrupt model or incomplete input produce an honest
    ``UNAVAILABLE`` result. Missing features are never fabricated, and no
    demo-scenario probability is substituted.
    """
    try:
        loaded = get_model(path)
    except PredictorError as exc:
        return _unavailable("MODEL_UNAVAILABLE", str(exc), path=_effective_path(path))

    canonical = build_features(vector)
    missing = []
    for name in loaded.feature_names:
        value = canonical.get(name)
        if value is None or not math.isfinite(float(value)):
            missing.append(name)
    if missing:
        return _unavailable(
            "DATA_INCOMPLETE",
            f"Required canonical features missing: {', '.join(missing)}.",
            model=loaded,
            missing_features=missing,
        )

    transformed = transform_vector(canonical)
    row = np.asarray(
        [[float(transformed[name]) for name in loaded.feature_names]],
        dtype=float,
    )
    try:
        proba = loaded.model.predict_proba(row)
        probability = float(proba[0, 1])
    except BaseException as exc:  # noqa: BLE001 - huge possible surface on predict()
        return _unavailable(
            "MODEL_UNAVAILABLE",
            f"Loaded model failed to predict: {exc}",
            model=loaded,
        )
    if not math.isfinite(probability):
        return _unavailable(
            "MODEL_UNAVAILABLE",
            "Loaded model returned a non-finite probability.",
            model=loaded,
        )
    return _ready(loaded, canonical, probability, missing)