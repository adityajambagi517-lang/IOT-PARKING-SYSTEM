import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { Slot, HealthStatus, MqttLiveMessage } from '../types';

interface NotificationItem {
  id: string;
  type: 'success' | 'warning' | 'info' | 'error';
  title: string;
  message: string;
  timestamp: string;
}

interface ParkingContextType {
  slots: Slot[];
  health: HealthStatus | null;
  wsConnected: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  durations: Record<number, number>; // slot_id -> elapsed seconds
  liveMessages: MqttLiveMessage[];
  notifications: NotificationItem[];
  dismissNotification: (id: string) => void;
  refreshData: () => Promise<void>;
  sendCommand: (cmd: string, params?: Record<string, any>) => Promise<{ success: boolean; detail?: string }>;
  isHardwareMode: boolean;
}

const ParkingContext = createContext<ParkingContextType | undefined>(undefined);

export const ParkingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [slots, setSlots] = useState<Slot[]>([
    { id: 1, lot_id: 'A', slot_id: 1, slot: 1, occupied: false, status: 'free', distance_cm: 150, rssi: -50, seq: 0, ts: null, last_changed: null, updated_at: null },
    { id: 2, lot_id: 'A', slot_id: 2, slot: 2, occupied: false, status: 'free', distance_cm: 150, rssi: -50, seq: 0, ts: null, last_changed: null, updated_at: null },
    { id: 3, lot_id: 'A', slot_id: 3, slot: 3, occupied: false, status: 'free', distance_cm: 150, rssi: -50, seq: 0, ts: null, last_changed: null, updated_at: null },
    { id: 4, lot_id: 'A', slot_id: 4, slot: 4, occupied: false, status: 'free', distance_cm: 150, rssi: -50, seq: 0, ts: null, last_changed: null, updated_at: null },
  ]);

  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [durations, setDurations] = useState<Record<number, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 });
  const [liveMessages, setLiveMessages] = useState<MqttLiveMessage[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Persistent reference for occupied start times (slot_id -> timestamp ms)
  const occupancyStartTimes = useRef<Record<number, number>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<number | null>(null);

  const addNotification = useCallback((type: 'success' | 'warning' | 'info' | 'error', title: string, message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications(prev => [{ id, type, title, message, timestamp: new Date().toLocaleTimeString() }, ...prev.slice(0, 4)]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Fetch initial REST data
  const fetchSlots = useCallback(async () => {
    try {
      const res = await fetch('/api/slots');
      if (res.ok) {
        const data: Slot[] = await res.json();
        setSlots(prev => {
          const map = new Map(data.map(s => [s.slot_id, s]));
          return prev.map(p => map.get(p.slot_id) || p);
        });
      }
    } catch (e) {
      console.warn('Error fetching slots:', e);
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data: HealthStatus = await res.json();
        setHealth(data);
      }
    } catch (e) {
      console.warn('Error fetching health:', e);
    }
  }, []);

  const refreshData = useCallback(async () => {
    await Promise.all([fetchSlots(), fetchHealth()]);
  }, [fetchSlots, fetchHealth]);

  // Command sender (buzzer / LED)
  const sendCommand = useCallback(async (cmd: string, params: Record<string, any> = {}): Promise<{ success: boolean; detail?: string }> => {
    try {
      const body = { cmd, ...params };
      const res = await fetch('/api/cmd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.status === 'sent') {
        addNotification('success', 'Hardware Command Sent', `Command '${cmd}' dispatched successfully.`);
        return { success: true };
      } else {
        const msg = data.detail || (data.status === 'failed' ? 'MQTT Broker not connected' : 'Execution failed');
        addNotification('error', 'Command Failed', msg);
        return { success: false, detail: msg };
      }
    } catch (e: any) {
      addNotification('error', 'Network Error', e.message || 'Could not send command to backend');
      return { success: false, detail: e.message };
    }
  }, [addNotification]);

  // Handle incoming slot state updates
  const handleSlotUpdate = useCallback((update: any) => {
    const slotId = update.slot_id || update.slot;
    const occupied = Boolean(update.occupied);
    const distance = typeof update.distance_cm === 'number' ? update.distance_cm : 150;

    setSlots(prev => {
      return prev.map(s => {
        if (s.slot_id === slotId) {
          const stateChanged = s.occupied !== occupied;
          if (stateChanged) {
            if (occupied) {
              occupancyStartTimes.current[slotId] = Date.now();
              addNotification('warning', `Vehicle Detected — Bay ${slotId}`, `Bay ${slotId} is now OCCUPIED (${distance} cm).`);
            } else {
              delete occupancyStartTimes.current[slotId];
              addNotification('success', `Bay ${slotId} Vacated`, `Vehicle departed from Bay ${slotId}. Slot is now FREE.`);
            }
          }
          return {
            ...s,
            occupied,
            status: occupied ? 'occupied' : 'free',
            distance_cm: distance,
            rssi: update.rssi ?? s.rssi,
            seq: update.seq ?? s.seq,
            ts: update.ts ?? new Date().toISOString(),
            last_changed: stateChanged ? new Date().toISOString() : s.last_changed,
          };
        }
        return s;
      });
    });

    // Record live MQTT message
    setLiveMessages(prev => [
      {
        id: Math.random().toString(36).substring(2, 9),
        topic: `parking/A/slot/${slotId}/state`,
        payload: update,
        timestamp: new Date().toLocaleTimeString(),
        type: 'slot_update',
      },
      ...prev.slice(0, 19),
    ]);
  }, [addNotification]);

  // WebSocket Connection
  useEffect(() => {
    let unmounted = false;

    const connectWs = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (unmounted) return;
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          if (unmounted) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'slots' && Array.isArray(data.slots)) {
              setSlots(prev => {
                const map = new Map<number, Slot>(data.slots.map((s: Slot) => [s.slot_id, s]));
                return prev.map(p => {
                  const updated = map.get(p.slot_id);
                  if (updated) {
                    if (updated.occupied && !occupancyStartTimes.current[p.slot_id]) {
                      const startTime = updated.last_changed ? new Date(updated.last_changed).getTime() : Date.now();
                      occupancyStartTimes.current[p.slot_id] = isNaN(startTime) ? Date.now() : startTime;
                    } else if (!updated.occupied) {
                      delete occupancyStartTimes.current[p.slot_id];
                    }
                    return updated;
                  }
                  return p;
                });
              });
              if (data.device_status) {
                setHealth(h => h ? { ...h, status: data.device_status, esp32_connected: data.device_status === 'online' } : null);
              }
            } else if (data.type === 'slot_update') {
              handleSlotUpdate(data);
            } else if (data.type === 'device_status') {
              const isOnline = data.status === 'online';
              setHealth(h => h ? { ...h, status: data.status, esp32_connected: isOnline, last_seen: data.ts } : null);
              setLiveMessages(prev => [
                {
                  id: Math.random().toString(36).substring(2, 9),
                  topic: `parking/${data.lot_id || 'A'}/device/status`,
                  payload: data,
                  timestamp: new Date().toLocaleTimeString(),
                  type: 'device_status',
                },
                ...prev.slice(0, 19),
              ]);
            }
          } catch (e) {
            console.warn('WS message parse error:', e);
          }
        };

        ws.onclose = () => {
          if (unmounted) return;
          setWsConnected(false);
          reconnectTimeout.current = window.setTimeout(connectWs, 3000);
        };

        ws.onerror = () => {
          if (unmounted) return;
          setWsConnected(false);
          ws.close();
        };
      } catch (e) {
        if (!unmounted) {
          reconnectTimeout.current = window.setTimeout(connectWs, 3000);
        }
      }
    };

    connectWs();
    refreshData();

    // Health poll every 5s
    const healthInterval = setInterval(fetchHealth, 5000);

    return () => {
      unmounted = true;
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      clearInterval(healthInterval);
      if (wsRef.current) wsRef.current.close();
    };
  }, [fetchHealth, handleSlotUpdate, refreshData]);

  // Duration timer: ticks every second for occupied slots
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const newDurations: Record<number, number> = {};
      slots.forEach(slot => {
        if (slot.occupied) {
          const start = occupancyStartTimes.current[slot.slot_id] || now;
          const elapsed = Math.max(0, Math.floor((now - start) / 1000));
          newDurations[slot.slot_id] = elapsed;
        } else {
          newDurations[slot.slot_id] = 0;
        }
      });
      setDurations(newDurations);
    }, 1000);

    return () => clearInterval(timer);
  }, [slots]);

  const isHardwareMode = Boolean(health?.esp32_connected);

  return (
    <ParkingContext.Provider
      value={{
        slots,
        health,
        wsConnected,
        activeTab,
        setActiveTab,
        durations,
        liveMessages,
        notifications,
        dismissNotification,
        refreshData,
        sendCommand,
        isHardwareMode,
      }}
    >
      {children}
    </ParkingContext.Provider>
  );
};

export const useParking = () => {
  const context = useContext(ParkingContext);
  if (!context) {
    throw new Error('useParking must be used within a ParkingProvider');
  }
  return context;
};
