"""FlashGuard risk engine.

Owns the canonical feature contract (``features``) and the trained-model
predictor (``predictor``). ``features`` is the single source of truth that both
ML training (``ml/src``) and live inference share; ``predictor`` wraps the
validated calibrated Random Forest baseline and returns an honest prediction
or an explicit ``UNAVAILABLE`` result when the model/data cannot produce one.
It is not wired into any route yet (Step 6 keeps ``/api/v1/risk/assess`` and
its scenario logic unchanged; Step 7 will connect the two).
"""