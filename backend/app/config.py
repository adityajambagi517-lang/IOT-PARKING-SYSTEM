from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    mqtt_broker: str = "localhost"
    mqtt_port: int = 1883
    mqtt_username: str = ""
    mqtt_password: str = ""
    mqtt_client_id: str = "parking-backend"
    database_url: str = "sqlite:///./parking.db"
    lot_id: str = "A"
    num_slots: int = 4
    model_path: str = "backend/models/occupancy_model.pkl"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
