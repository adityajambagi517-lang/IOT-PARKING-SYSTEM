"""
Train ML occupancy prediction model and record benchmark metrics.
Run from project root:
    python backend/scripts/train_model.py
"""

import json
import os
import sys

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, PROJECT_ROOT)

from backend.app.config import settings
from backend.app.db import SessionLocal
from backend.app import predict


def main():
    print(f"[TRAIN] Loading data from database: {settings.database_url}")
    db = SessionLocal()
    try:
        metrics = predict.train_model(db)
        print("\n=== Model Training Results ===")
        print(f"Events Processed:    {metrics.get('event_count', 0)}")
        print(f"Hourly Observations: {metrics.get('hourly_samples', 0)}")

        rf = metrics.get("random_forest", {})
        base = metrics.get("baseline", {})

        print("\nModel Comparison:")
        print(f"  RandomForestRegressor:  MAE={rf.get('mae')} | RMSE={rf.get('rmse')} | R2={rf.get('r2')}")
        print(f"  Hourly-Mean Baseline:   MAE={base.get('mae')} | RMSE={base.get('rmse')} | R2={base.get('r2')}")

        if "metrics_saved" in metrics or os.path.exists("backend/models/metrics.json"):
            print(f"\nModel artifacts successfully saved to: {settings.model_path}")
            print("Metrics written to: backend/models/metrics.json")
    finally:
        db.close()


if __name__ == "__main__":
    main()
