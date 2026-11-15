"""
ML prediction module for Smart Parking occupancy forecasting.

Trains a RandomForestRegressor on historical event data, persists it with
joblib, and generates 24-hour-ahead occupancy predictions with confidence
intervals derived from the forest's individual tree predictions.
"""

from __future__ import annotations

import json
import logging
import math
import os
from datetime import datetime, timedelta
from typing import Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sqlalchemy.orm import Session

from .config import settings
from .models import Event

logger = logging.getLogger(__name__)

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _resolve_path(path_str: str) -> str:
    if os.path.isabs(path_str):
        return path_str
    if os.path.exists(path_str):
        return os.path.abspath(path_str)
    return os.path.join(PROJECT_ROOT, path_str)


METRICS_PATH = _resolve_path("backend/models/metrics.json")


# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------

def prepare_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Enrich a DataFrame that has at minimum columns [ts, occupied] with
    time-based and lag features.

    Returns the enriched DataFrame (NaN rows from lags are dropped).
    """
    df = df.copy()
    df["ts"] = pd.to_datetime(df["ts"])
    df = df.sort_values("ts").reset_index(drop=True)

    df["hour"] = df["ts"].dt.hour
    df["day_of_week"] = df["ts"].dt.dayofweek          # 0=Mon
    df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)

    # Circular encoding of hour
    df["hour_sin"] = np.sin(2 * np.pi * df["hour"] / 24)
    df["hour_cos"] = np.cos(2 * np.pi * df["hour"] / 24)

    # Lag features (rolling hourly mean, shifted)
    df = df.set_index("ts")
    occ_series = df["occupied"].astype(float)
    df["lag_1h"] = occ_series.shift(freq="1h").reindex(df.index).bfill().ffill().fillna(0.0)
    df["lag_24h"] = occ_series.shift(freq="24h").reindex(df.index).bfill().ffill().fillna(0.0)
    df = df.reset_index()

    df = df.dropna(subset=["lag_1h", "lag_24h"])
    return df


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train_model(db: Session) -> dict:
    """
    Load events, engineer features, train RandomForestRegressor, evaluate
    against a naive hourly-mean baseline, persist model and metrics.

    Returns a metrics dict.
    """
    rows = db.query(Event).order_by(Event.ts.asc()).all()
    if len(rows) < 50:
        logger.warning("Not enough data to train a model (%d events).", len(rows))
        return {"error": "Insufficient data", "event_count": len(rows)}

    data = [
        {"ts": r.ts or r.received_at, "occupied": int(r.occupied), "slot_id": r.slot_id}
        for r in rows
    ]
    df_raw = pd.DataFrame(data)
    df_raw["ts"] = pd.to_datetime(df_raw["ts"])

    # Resample to hourly mean occupancy (across all slots)
    df_raw = df_raw.set_index("ts")
    hourly = df_raw["occupied"].resample("1h").mean().dropna().reset_index()
    hourly.columns = ["ts", "occupied"]

    df = prepare_features(hourly)

    FEATURE_COLS = ["hour", "day_of_week", "is_weekend", "hour_sin", "hour_cos", "lag_1h", "lag_24h"]
    TARGET_COL = "occupied"

    X = df[FEATURE_COLS].values
    y = df[TARGET_COL].values

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, shuffle=False)

    # --- Random Forest ---
    model = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
    model.fit(X_train, y_train)
    y_pred_rf = model.predict(X_test)

    # --- Baseline: mean occupancy per hour of day ---
    hour_means = df.groupby("hour")["occupied"].mean().to_dict()
    test_df = df.iloc[len(X_train):].copy()
    y_pred_baseline = test_df["hour"].map(hour_means).fillna(0).values

    def _metrics(y_true, y_pred, name: str) -> dict:
        mae = mean_absolute_error(y_true, y_pred)
        rmse = math.sqrt(mean_squared_error(y_true, y_pred))
        r2 = r2_score(y_true, y_pred)
        return {"model": name, "mae": round(mae, 4), "rmse": round(rmse, 4), "r2": round(r2, 4)}

    rf_metrics = _metrics(y_test, y_pred_rf, "RandomForest")
    baseline_metrics = _metrics(y_test, y_pred_baseline, "HourlyMean_Baseline")

    metrics = {
        "trained_at": datetime.utcnow().isoformat(),
        "event_count": len(rows),
        "hourly_samples": len(df),
        "random_forest": rf_metrics,
        "baseline": baseline_metrics,
    }

    # Persist model
    model_file = _resolve_path(settings.model_path)
    os.makedirs(os.path.dirname(model_file), exist_ok=True)
    joblib.dump({"model": model, "hour_means": hour_means, "feature_cols": FEATURE_COLS}, model_file)
    logger.info("Model saved to %s", model_file)

    # Persist metrics
    metrics_file = _resolve_path(METRICS_PATH)
    os.makedirs(os.path.dirname(metrics_file), exist_ok=True)
    with open(metrics_file, "w") as f:
        json.dump(metrics, f, indent=2)
    logger.info("Metrics saved to %s", metrics_file)

    return metrics


# ---------------------------------------------------------------------------
# Inference
# ---------------------------------------------------------------------------

def load_model() -> Optional[dict]:
    """Load the persisted model bundle from disk. Returns None if not found."""
    model_file = _resolve_path(settings.model_path)
    if not os.path.exists(model_file):
        logger.info("No model found at %s", model_file)
        return None
    try:
        bundle = joblib.load(model_file)
        logger.info("Model loaded from %s", model_file)
        return bundle
    except Exception as exc:
        logger.error("Failed to load model: %s", exc)
        return None


def predict_occupancy(hours_ahead: int = 24) -> list[dict]:
    """
    Generate predictions for the next `hours_ahead` hours.

    Returns a list of dicts: {ts, predicted_occupancy_pct, lower, upper}.
    Falls back to hourly-mean baseline if no model is available.
    """
    bundle = load_model()
    now = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    future_hours = [now + timedelta(hours=i + 1) for i in range(hours_ahead)]

    results = []

    if bundle is None:
        # Fallback: flat 50% with no confidence
        for ts in future_hours:
            results.append({
                "ts": ts.isoformat(),
                "predicted_occupancy_pct": 50.0,
                "lower": 30.0,
                "upper": 70.0,
            })
        return results

    model: RandomForestRegressor = bundle["model"]
    hour_means: dict = bundle["hour_means"]

    # Build feature matrix for future timestamps
    rows = []
    for ts in future_hours:
        hour = ts.hour
        dow = ts.weekday()
        is_weekend = int(dow >= 5)
        lag_1h_val = hour_means.get(hour, 0.5)
        lag_24h_val = hour_means.get(hour, 0.5)
        rows.append([
            hour, dow, is_weekend,
            np.sin(2 * np.pi * hour / 24),
            np.cos(2 * np.pi * hour / 24),
            lag_1h_val, lag_24h_val,
        ])

    X_future = np.array(rows)

    # Tree-level predictions for confidence interval
    tree_preds = np.array([tree.predict(X_future) for tree in model.estimators_])
    mean_preds = tree_preds.mean(axis=0)
    std_preds = tree_preds.std(axis=0)

    for i, ts in enumerate(future_hours):
        pct = float(np.clip(mean_preds[i], 0, 1)) * 100
        std = float(std_preds[i]) * 100
        lower = max(0.0, round(pct - 1.96 * std, 1))
        upper = min(100.0, round(pct + 1.96 * std, 1))
        results.append({
            "ts": ts.isoformat(),
            "predicted_occupancy_pct": round(pct, 1),
            "lower": lower,
            "upper": upper,
        })

    return results


def get_best_arrival_time(predictions: list[dict]) -> str:
    """
    Given a list of prediction dicts, return a plain-English recommendation
    for the best time to arrive (lowest predicted occupancy).
    """
    if not predictions:
        return "No prediction data available."

    best = min(predictions, key=lambda x: x["predicted_occupancy_pct"])
    ts = datetime.fromisoformat(best["ts"])
    hour = ts.hour
    label = f"{hour % 12 or 12} {'AM' if hour < 12 else 'PM'}"
    pct = best["predicted_occupancy_pct"]
    return f"Best time to arrive is {label} ({pct:.0f}% predicted occupancy)."
