import React, { useState } from 'react';
import { useParking } from '../../context/ParkingContext';
import { 
  Wifi, 
  WifiOff, 
  Bell, 
  RefreshCw, 
  Volume2, 
  Server, 
  Activity,
  Layers
} from 'lucide-react';

export const Header: React.FC = () => {
  const { activeTab, health, wsConnected, isHardwareMode, refreshData, sendCommand } = useParking();
  const [buzzerLoading, setBuzzerLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);

  const getPageTitle = () => {
    switch (activeTab) {
      case 'overview':
        return { title: 'System Overview', desc: 'Real-time lot occupancy metrics & operational status' };
      case 'live':
        return { title: 'Live Parking Bays', desc: 'Sub-second ultrasonic sensor feed with automated vehicle tracking' };
      case 'analytics':
        return { title: 'Analytics & Forecast', desc: 'Historical usage trends & Machine Learning 24-hour occupancy prediction' };
      case 'history':
        return { title: 'Parking Session History', desc: 'Searchable audit logs & CSV report export' };
      case 'health':
        return { title: 'Device & Hardware Telemetry', desc: 'ESP32 health, MQTT broker metrics & remote actuator diagnostics' };
      case 'demo':
        return { title: 'Evaluation Demo Center', desc: 'Live presentation checklist, architecture pipeline & MQTT stream' };
      case 'settings':
        return { title: 'System Settings', desc: 'Firmware parameters, thresholds, and infrastructure configuration' };
      default:
        return { title: 'Smart Parking IoT', desc: 'Real-time occupancy management' };
    }
  };

  const handleTestBuzzer = async () => {
    setBuzzerLoading(true);
    await sendCommand('buzzer', { duration_ms: 500 });
    setTimeout(() => setBuzzerLoading(false), 600);
  };

  const handleRefresh = async () => {
    setRefreshLoading(true);
    await refreshData();
    setTimeout(() => setRefreshLoading(false), 500);
  };

  const { title, desc } = getPageTitle();

  return (
    <header className="h-20 px-8 bg-[#090d16]/90 backdrop-blur-md border-b border-slate-800/80 flex items-center justify-between sticky top-0 z-30">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
          {title}
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
      </div>

      <div className="flex items-center gap-3">
        {/* Hardware Mode / Simulator Mode Badge */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
            isHardwareMode
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isHardwareMode ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          <span>{isHardwareMode ? 'HARDWARE ACTIVE' : 'SIMULATOR / WAITING'}</span>
        </div>

        {/* ESP32 Hardware Status */}
        <div
          className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border ${
            health?.esp32_connected
              ? 'bg-slate-900 border-emerald-500/30 text-emerald-400'
              : 'bg-slate-900 border-rose-500/30 text-rose-400'
          }`}
          title={health?.esp32_connected ? 'ESP32 DevKit is transmitting telemetry' : 'ESP32 heartbeat not detected'}
        >
          {health?.esp32_connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          <span>ESP32: {health?.esp32_connected ? 'Online' : 'Offline'}</span>
        </div>

        {/* MQTT Broker Status */}
        <div
          className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border ${
            health?.mqtt_connected
              ? 'bg-slate-900 border-cyan-500/30 text-cyan-400'
              : 'bg-slate-900 border-slate-700 text-slate-400'
          }`}
          title="MQTT Broker communication status"
        >
          <Server className="w-3.5 h-3.5" />
          <span>Broker: {health?.mqtt_connected ? '1883 OK' : 'Disconnected'}</span>
        </div>

        {/* WebSocket Status */}
        <div
          className={`hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border ${
            wsConnected
              ? 'bg-slate-900 border-indigo-500/30 text-indigo-400'
              : 'bg-slate-900 border-rose-500/30 text-rose-400'
          }`}
          title="Real-time WebSocket streaming status"
        >
          <Activity className="w-3.5 h-3.5" />
          <span>WS: {wsConnected ? 'Connected' : 'Reconnecting'}</span>
        </div>

        <div className="h-6 w-px bg-slate-800 hidden md:block" />

        {/* Remote Buzzer Trigger Button */}
        <button
          onClick={handleTestBuzzer}
          disabled={buzzerLoading}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          title="Sound physical buzzer on ESP32 (0.5s)"
        >
          <Volume2 className={`w-3.5 h-3.5 ${buzzerLoading ? 'animate-bounce text-rose-400' : ''}`} />
          <span>{buzzerLoading ? 'Firing...' : 'Test Buzzer'}</span>
        </button>

        {/* Manual Refresh */}
        <button
          onClick={handleRefresh}
          disabled={refreshLoading}
          className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-100 border border-slate-700 transition-all active:scale-95"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${refreshLoading ? 'animate-spin text-indigo-400' : ''}`} />
        </button>
      </div>
    </header>
  );
};
