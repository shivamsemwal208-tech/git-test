# FlashGuard model card

## Status

No model has been trained or implemented in Phase 1.

## Intended task

Binary flood classification:

- `0`: no flood event
- `1`: flood event

The future model output will be a probability that the application maps to the documented risk bands.

## Intended baseline and comparison

1. Logistic Regression as a simple sanity check.
2. Random Forest as the first practical baseline.
3. XGBoost only as a comparison once the data quality and size support it.

## Required evaluation before any performance claim

- Precision
- Recall
- F1-score
- ROC-AUC
- Confusion matrix
- Location/time-aware split rationale

Recall is especially important because an undetected flood event can be more harmful than a false warning. Metrics must be reported only from actual evaluation and accompanied by data limitations.

## Known intended limits

- The model cannot replace official hydrological or emergency-authority warnings.
- Results depend on the coverage, quality, and timeliness of the input data.
- A demo scenario is not ML inference and must be visibly labelled as simulated.
