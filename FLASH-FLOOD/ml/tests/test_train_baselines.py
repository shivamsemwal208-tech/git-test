"""Tests for the Step-5 baseline training/validation script.

These tests guard the honesty rules of the project:
  * training uses ONLY the generated real dataset (never fabricated rows,
    never relabelled);
  * class imbalance is handled only via class_weight='balanced';
  * probability calibration reaches sklearn models with event groups intact;
  * leakage-aware evaluation out-performs the majority-class floor.
"""
import csv
from collections import Counter

import numpy as np
import pytest

from ml.src import train_baselines as tb

CSV = tb.DEFAULT_CSV

EXPECTED_COLUMNS = {
    # provenance
    "row_id", "label", "observed_at", "source",
    "dfo_report_number", "dfo_fid", "event_country", "event_main_cause",
    "event_severity", "event_impact_index", "event_start_date",
    "event_end_date", "anchor_lat", "anchor_lon", "negative_clean",
    # raw feature values fed through the shared canonical feature engine
    "rainfall_1h", "rainfall_3h", "rainfall_6h", "rainfall_24h",
    "rainfall_72h", "rainfall_7d", "antecedent_rainfall_7d",
    "soil_moisture_0_to_7cm", "elevation",
    # live terrain features (slope/aspect from batched Open-Meteo elevation)
    "slope_degrees", "aspect_degrees",
    # optional river distance — no source in this release (blank by design)
    "river_distance_m",
}


# ─── Dataset honesty ─────────────────────────────────────────────────────

def test_dataset_is_the_real_generated_file():
    rows, issues = tb.load_rows(CSV)
    assert issues == {}
    assert len(rows) > 0
    assert len(rows) % 2 == 0  # one positive + one negative per event


def test_class_distribution_is_balanced_without_relabelling():
    rows, _ = tb.load_rows(CSV)
    labels = Counter(record["label"] for record in rows)
    assert labels["1"] == len(rows) // 2
    assert labels["0"] == len(rows) // 2


def test_no_fabricated_columns_or_features():
    with open(CSV, newline="", encoding="utf-8") as handle:
        headers = set(next(csv.reader(handle)))
    assert headers == EXPECTED_COLUMNS


def test_each_event_contributes_exactly_one_positive_and_one_negative():
    rows, _ = tb.load_rows(CSV)
    by_event: dict[str, Counter] = {}
    for record in rows:
        by_event.setdefault(record["dfo_report_number"], Counter())[record["label"]] += 1
    assert all(counts == Counter({"0": 1, "1": 1}) for counts in by_event.values())


# ─── Matrix construction ─────────────────────────────────────────────────

def test_rows_to_matrix_shape_order_and_zero_missing():
    rows, _ = tb.load_rows(CSV)
    matrix = tb.rows_to_matrix(rows)
    n = len(rows)
    # The model consumes the 11 required features; the optional river
    # distance (blank by design) is excluded from the matrix.
    assert matrix["feature_names"] == list(tb.CORE_FEATURE_NAMES)
    assert len(matrix["feature_names"]) == 11
    assert matrix["X"].shape == (n, 11)
    assert matrix["y"].shape == (n,)
    assert matrix["missing_values"] == 0
    assert matrix["labels"] == {1: n // 2, 0: n // 2}
    assert len(set(matrix["events"])) == n // 2
    assert matrix["start_years"].min() >= 1985
    assert matrix["start_years"].max() <= 2023
    assert len(set(matrix["geo_cells"])) > 0


# ─── Majority floor ──────────────────────────────────────────────────────

def test_majority_floor_is_exactly_the_naive_baseline():
    rows, _ = tb.load_rows(CSV)
    y = tb.rows_to_matrix(rows)["y"]
    proba, pred = tb.majority_predictor(y)
    assert proba == 0.5
    assert np.all(pred == 1)
    assert float(np.mean(pred == y)) == pytest.approx(0.5)


# ─── Model constructors / calibration plumbing ──────────────────────────

def test_calibrated_rf_accepts_event_groups_and_returns_unit_probabilities():
    """Exercises the metadata-routing fix so CalibratedClassifierCV's internal
    GroupKFold receives groups (otherwise fit() raises)."""
    rows, _ = tb.load_rows(CSV)
    matrix = tb.rows_to_matrix(rows)
    model = tb.make_calibrated_rf(n_estimators=10)
    model.fit(matrix["X"], matrix["y"], groups=matrix["events"])
    proba = model.predict_proba(matrix["X"])[:, 1]
    assert proba.shape == (len(rows),)
    assert np.all((proba >= 0.0) & (proba <= 1.0))


# ─── Event-aware GroupKFold (primary validation) ────────────────────────

def test_event_cv_returns_all_four_models_with_metrics():
    rows, _ = tb.load_rows(CSV)
    matrix = tb.rows_to_matrix(rows)
    results = tb.evaluate_event_cv(matrix, n_folds=3, n_estimators=25)
    assert set(results) == {"logreg", "random_forest", "calibrated_rf", "majority"}
    for name in ("logreg", "random_forest", "calibrated_rf"):
        metrics = results[name]["metrics"]
        assert 0.5 <= metrics["roc_auc"] <= 1.001
        assert 0.0 <= metrics["precision"] <= 1.0
        assert 0.0 <= metrics["recall"] <= 1.0
        assert 0.0 <= metrics["brier"] <= 1.0
        assert metrics["ece"] == metrics["ece"]  # not NaN


def test_logreg_and_rf_beat_the_majority_floor():
    rows, _ = tb.load_rows(CSV)
    matrix = tb.rows_to_matrix(rows)
    results = tb.evaluate_event_cv(matrix, n_folds=3, n_estimators=25)
    floor = results["majority"]["metrics"]["roc_auc"]
    assert floor == 0.5
    assert results["logreg"]["metrics"]["roc_auc"] > floor
    assert results["random_forest"]["metrics"]["roc_auc"] > floor
    assert results["calibrated_rf"]["metrics"]["roc_auc"] > floor


# ─── Temporal holdout (secondary) ────────────────────────────────────────

def test_temporal_holdout_runs_and_keeps_events_apart():
    rows, _ = tb.load_rows(CSV)
    matrix = tb.rows_to_matrix(rows)
    results = tb.evaluate_temporal_split(matrix, test_frac=0.2, n_estimators=25)
    assert set(results) == {"logreg", "random_forest"}
    train_events = set(matrix["events"]) - set(matrix["events"][results["logreg"]["test_index"]])
    n_events = len(set(matrix["events"]))
    n_test_rows = 2 * max(1, int(round(n_events * 0.2)))
    for idx in (results["logreg"]["test_index"], results["random_forest"]["test_index"]):
        assert len(idx) == n_test_rows
        assert not set(matrix["events"][idx]) & train_events  # no event leak


# ─── Metric helpers ──────────────────────────────────────────────────────

def test_ece_matches_hand_computed_weighted_absolute_error():
    """ECE = sum over bins of (share of samples) * |mean_pred - empirical freq|."""
    y = np.array([0, 1])
    proba = np.array([0.23, 0.87])
    ece = tb.ece_score(y, proba, n_bins=2)
    assert ece == pytest.approx(0.5 * abs(0.23 - 0.0) + 0.5 * abs(0.87 - 1.0))


def test_metrics_confusion_matrix_and_calibration_fields():
    y = np.array([0, 0, 1, 1])
    proba = np.array([0.1, 0.4, 0.6, 0.9])
    metrics = tb.compute_metrics(y, proba)
    assert metrics["confusion_matrix"] == [[2, 0], [0, 2]]
    assert metrics["roc_auc"] == 1.0
    assert 0.0 < metrics["brier"] < 1.0
    assert metrics["reliability_table"][0]["count"] >= 0