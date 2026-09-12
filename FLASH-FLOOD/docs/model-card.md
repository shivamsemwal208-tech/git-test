# FlashGuard model card

## Status

**Production model (live predictions): v1** — `rf_calibrated_baseline_v1.joblib`,
trained on the 300-row build-1 dataset (9 canonical features) and loaded by the
live predictor for arbitrary coordinates. The **v2** baseline (210-row build-3,
11 features) is a validated research experiment, preserved at
`rf_calibrated_baseline_v2.joblib`, but is **NOT used for live predictions**.
Neither is a production model in the sense of deployment; the predictor's
artifact is a research baseline. See the detailed card in
`ml/models/model_card.md` (metrics JSON: `ml/models/baseline_metrics.json`).
The v1 artifact, metrics, and card are preserved byte-identical in
`ml/models/archive_v1/`.

## Intended task

Binary flood classification:

- `0`: no flood event
- `1`: flood event

The live predictor (`backend/app/risk_engine/predictor.py`) maps the fitted
v1 artifact's calibrated probability to the documented risk bands and serves
arbitrary-coordinate requests; the frontend's predefined demo locations stay
on deterministic demo data and are unchanged.

## Baselines and comparison

Production (v1, 300 rows / build-1, 9 features — event-CV ROC-AUC 0.828,
F1 0.754, ECE 0.052 for the calibrated RFC selected at the time):
- Logistic Regression sanity check: raw held-out ROC-AUC 0.842.
- Calibrated Random Forest (sigmoid): ROC-AUC 0.828, F1 0.754, ECE 0.052.

Research-only (v2, 210 rows / build-3, 11 features — event-CV ROC-AUC 0.786,
F1 0.693, ECE 0.0865; not within the 0.05 ECE gate, so v2 probabilities are
ranking-signal only):
- Logistic Regression event-CV ROC-AUC 0.794; calibrated RFC 0.786; geo-block
  RFC 0.783; temporal RFC 0.717.

XGBoost is only a comparison once the data quality and size support it (not
used at 210–300 rows).

## Required evaluation before any performance claim

- Precision
- Recall
- F1-score
- ROC-AUC
- Confusion matrix
- Location/time-aware split rationale

Step 9 reports all of these from out-of-fold / held-out predictions only,
under event-aware GroupKFold (primary), 5°×5° geo-block GroupKFold and a
latest-20%-of-events temporal holdout (secondary).

Recall is especially important because an undetected flood event can be more
harmful than a false warning. Metrics must be reported only from actual
evaluation and accompanied by data limitations.

## On how to read the baseline numbers (honest)

300 rows (v1) / 210 rows (v2) across 60–72 countries is only enough for a
first signal check — large enough to show models beat the majority floor, far
too small for a production-accuracy claim. The production artifact
`rf_calibrated_baseline_v1.joblib` is a reproducible baseline, gated on
validation (event-CV ROC-AUC ≥ 0.6) and trained on its 9 required canonical
features (rainfall windows, soil moisture, elevation). The v2 artifact
(`rf_calibrated_baseline_v2.joblib`, 11 features incl. slope/aspect) is
validated but not loaded for live predictions; the optional `river_distance_m`
has no source in this release and is excluded from both. Metrics over v2 are
in `ml/models/baseline_metrics.json`; the v1 report is preserved in
`ml/models/archive_v1/`. v1 event-CV measured ROC-AUC 0.828 (calibrated RFC),
0.842 (LR), geo-block 0.802, temporal 0.835.

## Known intended limits

- The model cannot replace official hydrological or emergency-authority warnings.
- Results depend on the coverage, quality, and timeliness of the input data
  (labels come from a single archival source; slope/aspect are baseline terrain
  signals; river distance is not connected in this release).
- A demo scenario is not ML inference and must be visibly labelled as simulated.
- Safe-place/route guidance must communicate assumptions, never guarantee safety.