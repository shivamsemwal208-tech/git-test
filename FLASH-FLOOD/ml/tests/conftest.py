"""Shared pytest setup for the ML package: put the repo root on sys.path so
``ml.src.train_baselines`` (and its ``backend.app.risk_engine`` import) resolve."""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)