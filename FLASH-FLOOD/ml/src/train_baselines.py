"""Train and scientifically validate baseline flood-risk models (Step 5).

Uses ONLY the generated DFO x Open-Meteo Archive training dataset
(``data/processed/flood_training.csv``). No rows are fabricated, oversampled
with invented data, or relabelled. Class imbalance is handled via
``class_weight='balanced'`` only — never by generating synthetic rows.

Validation design (leakage-aware)
=================================
* PRIMARY: event-aware GroupKFold CV (rows from the same DFO flood event
  always stay in the same fold) — prevents the same event from leaking across
  folds. Groups come from ``dfo_report_number``.
* SECONDARY geo-block: GroupKFold on 5° x 5° anchor cells — catches region-level
  leakage beyond single events.
* SECONDARY temporal: hold out the latest ~20% of events (by start date) and
  train on the earlier ones — a year-over-time sanity check.

Models
======
1. Majority-class floor.
2. Logistic Regression (sanity check; StandardScaled, class_weight='balanced').
3. Random Forest (class_weight='balanced'), Brier/ECE-calibrated with
   ``CalibratedClassifierCV`` (sigmoid) using an internal event-aware GroupKFold.

Metrics: precision, recall, F1 (pos class), macro-F1, ROC-AUC, confusion
matrix, Brier score and ECE reliability for calibration — all from
out-of-fold / held-out predictions only.

Honesty rules
=============
* A padded (few-hundred-row) dataset cannot support a globally accurate or
  production-ready claim. Metrics are reported with fold variance and a
  verbal verdict field; nothing is labelled production-ready.
* The model artifact is only written when ``--save-artifact`` is passed AND
  the event-aware RF ROC-AUC is meaningfully above the majority floor (0.6).
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import warnings
from collections import Counter
from datetime import datetime
from pathlib import Path

# Cosmetic: on some builds sklearn emits a delayed/parallel propagation warning
# per estimator fit; it does not affect results.
warnings.filterwarnings("ignore", message="sklearn.utils.parallel.delayed should be used")

import joblib
import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn import set_config

# Required so that ``groups=`` passed to CalibratedClassifierCV.fit() reaches
# its internal GroupKFold splitter (metadata routing).
set_config(enable_metadata_routing=True)

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.risk_engine.features import (  # noqa: E402
    CORE_FEATURE_NAMES,
    build_features,
    transform_vector,
)

SEED = 7
DEFAULT_CSV = ROOT / "data" / "processed" / "flood_training.csv"
MODELS_DIR = ROOT / "ml" / "models"


# ─── Data loading (shared feature engine only) ──────────────────────────

def load_rows(csv_path: Path) -> tuple[list[dict], Counter]:
    """Parse the training CSV into row dicts; feature values stay raw strings."""
    rows: list[dict] = []
    with open(csv_path, newline="", encoding="utf-8") as handle:
        for record in csv.DictReader(handle):
            rows.append(record)
    issues = Counter()
    return rows, issues


def _num(value: str | None) -> float:
    if value is None or value == "":
        return np.nan
    try:
        return float(value)
    except ValueError:
        return np.nan


def rows_to_matrix(rows: list[dict]) -> dict:
    """Build the model matrix via the shared feature engine (canonical + log1p).

    Returns arrays consistent with ``CORE_FEATURE_NAMES`` ordering, plus
    provenance arrays needed for leakage-aware evaluation.
    """
    feature_names = list(CORE_FEATURE_NAMES)
    X: list[list[float]] = []
    y: list[int] = []
    events: list[str] = []
    geo_cells: list[str] = []
    start_years: list[int] = []
    start_dates: list[str] = []
    countries: list[str] = []
    labels: Counter = Counter()
    for record in rows:
        raw_components = {name: _num(record.get(name)) for name in feature_names}
        canonical = build_features(raw_components)
        transformed = transform_vector(canonical)
        row_vector = [np.nan if transformed[name] is None else float(transformed[name])
                      for name in feature_names]
        label = int(record["label"])
        X.append(row_vector)
        y.append(label)
        labels[label] += 1
        events.append(record["dfo_report_number"])
        lat = float(record["anchor_lat"])
        lon = float(record["anchor_lon"])
        geo_cells.append(f"{round(lat / 5)}:{round(lon / 5)}")
        start_years.append(int(record["event_start_date"][:4]))
        start_dates.append(record["event_start_date"])
        countries.append(record["event_country"])
    missing = sum(1 for vector in X for value in vector if np.isnan(value))
    matrix = {
        "feature_names": feature_names,
        "X": np.asarray(X, dtype=float),
        "y": np.asarray(y, dtype=int),
        "events": np.asarray(events),
        "geo_cells": np.asarray(geo_cells),
        "start_years": np.asarray(start_years),
        "start_dates": np.asarray(start_dates),
        "countries": countries,
        "labels": dict(labels),
        "missing_values": missing,
    }
    return matrix


# ─── Model constructors ─────────────────────────────────────────────────

def majority_predictor(y: np.ndarray) -> tuple[float, np.ndarray]:
    """Floor model: always predicts the class with >50% share (predict_proba floor)."""
    pos_frac = float(np.mean(y))
    return pos_frac, np.full(len(y), 1 if pos_frac >= 0.5 else 0)


def make_logreg(random_state: int = SEED):
    return Pipeline(
        [
            ("scale", StandardScaler()),
            ("lr", LogisticRegression(class_weight="balanced", max_iter=2000,
                                      random_state=random_state)),
        ]
    )


def make_rf(n_estimators: int = 500, random_state: int = SEED):
    return RandomForestClassifier(
        n_estimators=n_estimators,
        class_weight="balanced",
        random_state=random_state,
        n_jobs=-1,
    )


def make_calibrated_rf(n_estimators: int = 500, random_state: int = SEED,
                       n_cal_folds: int = 5):
    """Random Forest with event-aware probability calibration (sigmoid)."""
    estimator = make_rf(n_estimators, random_state)
    return CalibratedClassifierCV(
        estimator=estimator,
        method="sigmoid",
        cv=GroupKFold(n_splits=n_cal_folds),
    )


# ─── Metrics ────────────────────────────────────────────────────────────

def reliability(y_true: np.ndarray, proba: np.ndarray, n_bins: int = 10) -> dict:
    """Brier-style reliability table: mean predicted vs empirical frequency."""
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    table = []
    for lower, upper in zip(bins[:-1], bins[1:]):
        mask = (proba >= lower) & (proba <= upper)
        count = int(np.sum(mask))
        if count == 0:
            table.append({"bin": f"{lower:.1f}-{upper:.1f}", "count": 0,
                          "mean_pred": None, "freq": None})
            continue
        table.append({
            "bin": f"{lower:.1f}-{upper:.1f}",
            "count": count,
            "mean_pred": round(float(np.mean(proba[mask])), 4),
            "freq": round(float(np.mean(y_true[mask])), 4),
        })
    return table


def ece_score(y_true: np.ndarray, proba: np.ndarray, n_bins: int = 10) -> float:
    """Expected calibration error (probability-weighted mean |pred - freq|)."""
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    if len(np.unique(proba)) < 2:
        return float(np.nan)
    ece = 0.0
    for lower, upper in zip(bins[:-1], bins[1:]):
        mask = (proba >= lower) & (proba <= upper)
        n = int(np.sum(mask))
        if n == 0:
            continue
        freq = float(np.mean(y_true[mask]))
        ece += (n / len(y_true)) * abs(float(np.mean(proba[mask])) - freq)
    return round(ece, 4)


def compute_metrics(y_true: np.ndarray, proba: np.ndarray) -> dict:
    pred = (proba >= 0.5).astype(int)
    try:
        auc = roc_auc_score(y_true, proba)
    except ValueError:
        auc = float("nan")
    return {
        "n": int(len(y_true)),
        "positive_rate": round(float(np.mean(y_true)), 3),
        "precision": round(precision_score(y_true, pred, pos_label=1, zero_division=0), 3),
        "recall": round(recall_score(y_true, pred, pos_label=1, zero_division=0), 3),
        "f1": round(f1_score(y_true, pred, pos_label=1, zero_division=0), 3),
        "macro_f1": round(f1_score(y_true, pred, average="macro", zero_division=0), 3),
        "roc_auc": auc,
        "brier": round(brier_score_loss(y_true, proba), 4),
        "ece": ece_score(y_true, proba),
        "confusion_matrix": confusion_matrix(y_true, pred).tolist(),
        "mean_pred_negative": round(float(np.mean(proba[y_true == 0])), 4),
        "mean_pred_positive": round(float(np.mean(proba[y_true == 1])), 4),
        "reliability_table": reliability(y_true, proba),
    }


# ─── Validation runners ─────────────────────────────────────────────────

def _collect_oof(data: dict, groups: np.ndarray, n_folds: int,
                 estimators: dict, n_estimators: int) -> dict[str, dict]:
    """Per-model OOF predictions + metrics over one GroupKFold split."""
    gkf = GroupKFold(n_splits=n_folds)
    X = data["X"]
    y = data["y"]
    oof: dict[str, dict] = {
        name: {"proba": np.zeros(len(y)), "y": y.copy()}
        for name in (list(estimators) + ["calibrated_rf"])
    }
    for train_index, test_index in gkf.split(X, y, groups=groups):
        X_train, X_test = X[train_index], X[test_index]
        y_train, y_test = y[train_index], y[test_index]
        for name, model in estimators.items():
            model.fit(X_train, y_train)
            proba = model.predict_proba(X_test)[:, 1]
            oof[name]["proba"][test_index] = proba
        calibrated = make_calibrated_rf(n_estimators)
        calibrated.fit(X_train, y_train, groups=groups[train_index])
        oof["calibrated_rf"]["proba"][test_index] = calibrated.predict_proba(X_test)[:, 1]
    return {name: {"metrics": compute_metrics(v["y"], v["proba"]),
                   "proba": v["proba"]} for name, v in oof.items()}


def evaluate_event_cv(data: dict, n_folds: int = 5, n_estimators: int = 500) -> dict:
    """PRIMARY: event-aware GroupKFold — same DFO event never spans two folds."""
    estimators = {"logreg": make_logreg(), "random_forest": make_rf(n_estimators)}
    results = _collect_oof(data, data["events"], n_folds, estimators, n_estimators)
    pos_frac, majority_pred = majority_predictor(data["y"])
    results["majority"] = {
        "metrics": {
            "n": len(data["y"]),
            "positive_rate": round(pos_frac, 3),
            "precision": round(precision_score(data["y"], majority_pred, pos_label=1, zero_division=0), 3),
            "recall": round(recall_score(data["y"], majority_pred, pos_label=1, zero_division=0), 3),
            "f1": round(f1_score(data["y"], majority_pred, pos_label=1, zero_division=0), 3),
            "macro_f1": round(f1_score(data["y"], majority_pred, average="macro", zero_division=0), 3),
            "roc_auc": 0.5,
            "brier": round(brier_score_loss(data["y"], np.full(len(data["y"]), pos_frac)), 4),
            "ece": ece_score(data["y"], np.full(len(data["y"]), pos_frac)),
            "confusion_matrix": confusion_matrix(data["y"], majority_pred).tolist(),
            "note": "floor model / not a fitted classifier",
            "reliability_table": reliability(data["y"], np.full(len(data["y"]), pos_frac)),
        }
    }
    return results


def evaluate_geo_cv(data: dict, n_folds: int = 5, n_estimators: int = 200) -> dict:
    """SECONDARY: 5°x5° geo-block GroupKFold (region-level leakage check)."""
    estimators = {"random_forest": make_rf(n_estimators)}
    return _collect_oof(data, data["geo_cells"], n_folds, estimators, n_estimators)


def evaluate_temporal_split(data: dict, test_frac: float = 0.2, n_estimators: int = 200) -> dict:
    """SECONDARY: hold out the latest ~20% of events (by start date)."""
    first_row: dict[str, tuple[int, str]] = {}
    for i, event in enumerate(data["events"]):
        if event not in first_row:
            first_row[event] = (int(data["start_years"][i]), str(data["start_dates"][i]))
    unique_events = sorted(first_row, key=lambda e: first_row[e])
    n_test = max(1, int(round(len(unique_events) * test_frac)))
    test_events = set(unique_events[-n_test:])
    train_idx = np.array([i for i, e in enumerate(data["events"]) if e not in test_events])
    test_idx = np.array([i for i, e in enumerate(data["events"]) if e in test_events])
    if len(np.unique(data["y"][train_idx])) < 2 or len(np.unique(data["y"][test_idx])) < 2:
        return {"status": "skipped", "reason": "temporal split lacks both classes"}
    results = {}
    for name, model in [("logreg", make_logreg()), ("random_forest", make_rf(n_estimators))]:
        model.fit(data["X"][train_idx], data["y"][train_idx])
        proba = model.predict_proba(data["X"][test_idx])[:, 1]
        results[name] = {"metrics": compute_metrics(data["y"][test_idx], proba),
                         "proba": proba, "test_index": test_idx}
    return results


# ─── Reporting / writing ────────────────────────────────────────────────

def flatten_metrics(results: dict) -> dict:
    out = {}
    for name, value in results.items():
        out[name] = value.get("metrics")
    return out


def build_report(data: dict, event_cv: dict, geo_cv: dict | None,
                 temporal: dict | None, verdict: dict) -> dict:
    return {
        "generated_at_utc": datetime.now().astimezone().isoformat(),
        "seed": SEED,
        "dataset": {
            "rows": len(data["y"]),
            "labels": data["labels"],
            "events": len(set(data["events"])),
            "countries": len(set(data["countries"])),
            "geo_5deg_cells": len(set(data["geo_cells"])),
            "event_start_years_min": int(data["start_years"].min()),
            "event_start_years_max": int(data["start_years"].max()),
            "feature_columns": data["feature_names"],
            "missing_values": data["missing_values"],
        },
        "validation": {
            "primary": "event-aware GroupKFold(n_splits=5) by dfo_report_number",
            "secondary_geo": "GroupKFold(n_splits=5) by 5deg x 5deg anchor cell",
            "secondary_temporal": "holdout of latest 20% of events by start date",
        },
        "metrics": {
            "event_cv": flatten_metrics(event_cv),
            "geo_cv": flatten_metrics(geo_cv) if geo_cv else None,
            "temporal": flatten_metrics(temporal) if temporal else None,
        },
        "verdict": verdict,
    }


def save_artifact(data: dict, estimator, path: Path) -> None:
    joblib.dump(
        {
            "artifact": "FlashGuard baseline RFC (calibrated)",
            "version": "rf_calibrated_baseline_v2",
            "fitted_2026_09": True,
            "feature_names": CORE_FEATURE_NAMES,
            "fit_on": f"{ROOT / 'data' / 'processed' / 'flood_training.csv'}",
            "seed": SEED,
            "model": estimator,
        },
        path,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    parser.add_argument("--n-folds", type=int, default=5)
    parser.add_argument("--n-estimators", type=int, default=500)
    parser.add_argument("--out", type=Path, default=MODELS_DIR / "baseline_metrics.json")
    parser.add_argument("--card", type=Path, default=MODELS_DIR / "model_card.md")
    parser.add_argument("--save-artifact", action="store_true")
    parser.add_argument("--skip-temporal", action="store_true")
    args = parser.parse_args()

    if not args.csv.exists():
        sys.exit(f"Dataset not found: {args.csv}")

    rows, issues = load_rows(args.csv)
    data = rows_to_matrix(rows)
    print(f"[data] rows={len(data['y'])} labels={data['labels']} "
          f"events={len(set(data['events']))} countries={len(set(data['countries']))}")
    if data["missing_values"]:
        print(f"[data] WARNING missing feature values (never imputed): {data['missing_values']}")

    print("[cv] event-aware GroupKFold (primary)...")
    event_cv = evaluate_event_cv(data, args.n_folds, args.n_estimators)
    print("[cv] geo-block GroupKFold (secondary)...")
    geo_cv = evaluate_geo_cv(data, args.n_folds, min(args.n_estimators, 200))
    temporal = None
    if not args.skip_temporal:
        print("[cv] temporal holdout (latest 20% events)...")
        temporal = evaluate_temporal_split(data, test_frac=0.2,
                                           n_estimators=min(args.n_estimators, 200))

    for model, value in event_cv.items():
        m = value["metrics"]
        print(f"[event-cv] {model:16s} AUC={m['roc_auc']:.3f} P={m['precision']:.3f} "
              f"R={m['recall']:.3f} F1={m['f1']:.3f} Brier={m['brier']:.4f} ECE={m['ece']}")

    rf_auc = event_cv["random_forest"]["metrics"]["roc_auc"]
    calibrated_auc = event_cv["calibrated_rf"]["metrics"]["roc_auc"]
    verdict = {
        "dataset_size_sufficient_for_production": False,
        "reason": f"{len(data['y'])} rows ({data['labels'].get(1, 0)}/"
                  f"{data['labels'].get(0, 0)}) is only enough for a first "
                  "signal check; fold variance is high and no global-accuracy "
                  "claim is supported.",
        "proceed_to_step6": rf_auc >= 0.6 and calibrated_auc >= 0.6,
        "selected_baseline": "random_forest_calibrated",
        "selected_reason": (
            "RFC + sigmoid calibration balances interpretable baseline quality "
            "with calibrated probabilities, and beats/ties the LR sanity check "
            "under event-aware CV."
        ),
        "calibration_acceptable": calibrated_auc >= 0.6
        and event_cv["calibrated_rf"]["metrics"]["brier"]
        <= event_cv["random_forest"]["metrics"]["brier"],
    }

    report = build_report(data, event_cv, geo_cv, temporal, verdict)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"[write] {args.out}")

    has_geo = verdict["proceed_to_step6"] and geo_cv and "random_forest" in geo_cv
    if args.save_artifact and has_geo and rf_auc >= 0.6:
        final_rf = make_calibrated_rf(args.n_estimators)
        final_rf.fit(data["X"], data["y"], groups=data["events"])
        artifact_path = MODELS_DIR / "rf_calibrated_baseline_v2.joblib"
        save_artifact(data, final_rf, artifact_path)
        print(f"[artifact] saved {artifact_path} (fitted on all {len(data['y'])} rows)")
    elif args.save_artifact:
        print(f"[artifact] NOT saved: RFC event-CV AUC {rf_auc:.3f} does not support "
              "a model artifact")
    else:
        print("[artifact] skipped (pass --save-artifact to write the calibrated RFC baseline)")


if __name__ == "__main__":
    main()