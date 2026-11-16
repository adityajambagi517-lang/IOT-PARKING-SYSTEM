export interface Slot {
  id: number;
  lot_id: string;
  slot_id: number;
  slot: number;
  occupied: boolean;
  status: 'occupied' | 'free';
  distance_cm: number;
  rssi: number | null;
  seq: number | null;
  ts: string | null;
  last_changed: string | null;
  updated_at: string | null;
}

export interface HealthStatus {
  status: 'online' | 'offline';
  esp32_connected: boolean;
  mqtt_connected: boolean;
  db_ok: boolean;
  slot_count: number;
  uptime_seconds: number;
  last_seen: string | null;
  last_heartbeat: string | null;
  device_timeout_seconds: number;
  version: string;
}

export interface AnalyticsSummary {
  total_slots: number;
  occupied: number;
  free_slots: number;
  occupancy_pct: number;
  peak_hour: number | null;
  avg_duration: number;
  avg_duration_min: number;
  avg_duration_seconds: number | null;
  total_sessions: number;
  turnover_rate: number;
  anomalies: Array<{
    type: string;
    slot_id: number;
    description: string;
    timestamp: string;
  }>;
  insights: string[];
  slot_states: Slot[];
}

export interface HourlyStat {
  hour: number;
  avg_occupancy_pct: number;
  session_count: number;
}

export interface DailyStat {
  day_of_week: number;
  day_name: string;
  avg_occupancy_pct: number;
  session_count: number;
}

export interface PredictRow {
  hour: number;
  ts: string;
  occupancy: number;
  predicted: number;
  lower: number;
  upper: number;
  is_fallback: boolean;
}

export interface PredictResponse {
  predictions: PredictRow[];
  forecast: PredictRow[];
  best_arrival_time: number | null;
  best_arrival_text: string;
  hours_ahead: number;
  is_fallback: boolean;
  model_type: string;
  model_source: string;
}

export interface ParkingSession {
  id: number;
  lot_id: string;
  slot_id: number;
  start_ts: string;
  end_ts: string | null;
  duration_seconds: number | null;
  is_active: boolean;
}

export interface EventLog {
  id: number;
  lot_id: string;
  slot_id: number;
  occupied: boolean;
  distance_cm: number;
  rssi: number | null;
  seq: number | null;
  ts: string | null;
  received_at: string;
}

export interface UtilizationItem {
  slot_id: number;
  utilization_pct: number;
  total_parked_seconds: number;
  session_count: number;
}

export interface MqttLiveMessage {
  id: string;
  topic: string;
  payload: any;
  timestamp: string;
  type: 'slot_update' | 'device_status' | 'slots' | 'cmd' | 'unknown';
}
