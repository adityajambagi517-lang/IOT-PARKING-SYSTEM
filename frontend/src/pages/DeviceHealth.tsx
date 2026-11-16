import React, { useState } from 'react';
import { useParking } from '../context/ParkingContext';
import { Slot } from '../types';
import { 
  Cpu, 
  Server, 
  Wifi, 
  WifiOff, 
  Activity, 
  Database, 
  Volume2, 
  Lightbulb, 
  Clock, 
  Radio, 
  ShieldCheck, 
  CheckCircle2, 
  XCircle,
  HelpCircle
} from 'lucide-react';

export const DeviceHealth: React.FC = () => {
  const { health, slots, wsConnected, isHardwareMode, sendCommand } = useParking();
  const [testingCmd, setTestingCmd] = useState<string | null>(null);

  const handleTestBuzzer = async () => {
    setTestingCmd('buzzer');
    await sendCommand('buzzer', { duration_ms: 500 });
    setTimeout(() => setTestingCmd(null), 700);
  };

  const handleTestLed = async (slotId: number, color: 'red' | 'green') => {
    const key = `led-${slotId}-${color}`;
    setTestingCmd(key);
    // Turn ON
    await sendCommand('led', { slot: slotId, color, state: true });
    // Turn OFF after 1.5s
    setTimeout(async () => {
      await sendCommand('led', { slot: slotId, color, state: false });
      setTestingCmd(null);
    }, 1500);
  };

  // GPIO mappings from firmware config.h
  const pinoutInfo = [
    { slot: 1, trig: 5, echo: 34, green: 13, red: 26 },
    { slot: 2, trig: 18, echo: 35, green: 12, red: 25 },
    { slot: 3, trig: 19, echo: 32, green: 14, red: 4 },
    { slot: 4, trig: 23, echo: 33, green: 27, red: 0 },
  ];

  return (
    <div className="space-y-6">
      {/* Node Health Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* ESP32 Edge Device */}
        <div className="bg-[#0f172a] p-5 rounded-2xl border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">ESP32 DevKit V1</span>
            <Cpu className={`w-4 h-4 ${health?.esp32_connected ? 'text-emerald-400' : 'text-rose-400'}`} />
          </div>
          <div className={`text-2xl font-extrabold font-mono ${
            health?.esp32_connected ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {health?.esp32_connected ? 'ONLINE' : 'OFFLINE'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Last Seen:</span>
            <span className="font-mono text-slate-300">
              {health?.last_seen ? new Date(health.last_seen).toLocaleTimeString() : 'No heartbeat yet'}
            </span>
          </div>
        </div>

        {/* MQTT Broker */}
        <div className="bg-[#0f172a] p-5 rounded-2xl border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">MQTT Broker (1883)</span>
            <Server className={`w-4 h-4 ${health?.mqtt_connected ? 'text-cyan-400' : 'text-rose-400'}`} />
          </div>
          <div className={`text-2xl font-extrabold font-mono ${
            health?.mqtt_connected ? 'text-cyan-400' : 'text-rose-400'
          }`}>
            {health?.mqtt_connected ? 'CONNECTED' : 'DISCONNECTED'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Protocol:</span>
            <span className="font-mono text-slate-300">TCP / Mosquitto & amqtt</span>
          </div>
        </div>

        {/* WebSocket Stream */}
        <div className="bg-[#0f172a] p-5 rounded-2xl border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">WebSocket Stream</span>
            <Activity className={`w-4 h-4 ${wsConnected ? 'text-indigo-400' : 'text-rose-400'}`} />
          </div>
          <div className={`text-2xl font-extrabold font-mono ${
            wsConnected ? 'text-indigo-400' : 'text-rose-400'
          }`}>
            {wsConnected ? 'LIVE SYNC' : 'OFFLINE'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Latency:</span>
            <span className="font-mono text-slate-300">&lt; 15 ms</span>
          </div>
        </div>

        {/* SQLite Database */}
        <div className="bg-[#0f172a] p-5 rounded-2xl border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Database Storage</span>
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-emerald-400">
            {health?.db_ok ? 'HEALTHY' : 'ERROR'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Uptime:</span>
            <span className="font-mono text-slate-300">{health?.uptime_seconds ?? 0}s</span>
          </div>
        </div>
      </div>

      {/* Sensor Diagnostics Panels (4 Ultrasonic HC-SR04 Nodes) */}
      <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800/80 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              HC-SR04 Ultrasonic Sensor Telemetry & Pin Assignments
            </h3>
            <p className="text-xs text-slate-400">
              Echo lines connected through 1k&Omega; / 2k&Omega; voltage divider for 3.3V safe logic input to ESP32
            </p>
          </div>
          <span className="text-xs font-mono font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
            4 Nodes Active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {slots.map((s: Slot, idx: number) => {
            const p = pinoutInfo[idx];
            return (
              <div key={s.slot_id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-white">Sensor #{s.slot_id}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                    s.occupied ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {s.occupied ? 'OCCUPIED' : 'FREE'}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-black/40 border border-slate-800 font-mono text-xs space-y-1">
                  <div className="flex justify-between text-slate-400">
                    <span>Live Distance:</span>
                    <span className="font-bold text-white">{s.distance_cm} cm</span>
                  </div>
                  <div className="flex justify-between text-slate-500 text-[10px]">
                    <span>TRIG GPIO:</span>
                    <span className="text-slate-300">GPIO {p.trig}</span>
                  </div>
                  <div className="flex justify-between text-slate-500 text-[10px]">
                    <span>ECHO GPIO:</span>
                    <span className="text-slate-300">GPIO {p.echo} (Divider)</span>
                  </div>
                  <div className="flex justify-between text-slate-500 text-[10px]">
                    <span>LED Green / Red:</span>
                    <span className="text-slate-300">GPIO {p.green} / {p.red}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span>Packet Sequence:</span>
                  <span className="font-mono text-slate-300">#{s.seq ?? 0}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actuator Remote Diagnostics Console */}
      <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800/80 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Actuator Remote Diagnostics (FastAPI &rarr; MQTT &rarr; ESP32)
            </h3>
            <p className="text-xs text-slate-400">
              Triggers live commands via <code className="text-indigo-300 font-mono">parking/A/cmd</code> for hardware validation during evaluation
            </p>
          </div>
          <Volume2 className="w-5 h-5 text-indigo-400" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Buzzer Trigger Card */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Volume2 className="w-4 h-4 text-rose-400" />
                <h4 className="font-bold text-sm text-white">Active Buzzer (GPIO 2)</h4>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Emits an audible 500 ms diagnostic pulse through the active piezo buzzer connected to GPIO 2.
              </p>
              <div className="p-2.5 rounded-lg bg-black/40 font-mono text-[10px] text-slate-400 mb-4">
                Payload: &#123;"cmd":"buzzer","duration_ms":500&#125;
              </div>
            </div>

            <button
              onClick={handleTestBuzzer}
              disabled={testingCmd === 'buzzer'}
              className="w-full py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20 transition-all active:scale-98 disabled:opacity-50"
            >
              {testingCmd === 'buzzer' ? 'Firing Buzzer...' : 'Test Buzzer (500 ms)'}
            </button>
          </div>

          {/* LED Override Tests (Slots 1 & 2) */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                <h4 className="font-bold text-sm text-white">Slots 1 & 2 Indicator LEDs</h4>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Overrides and flashes the physical dual red/green LEDs on Slots 1 and 2 for 1.5 seconds.
              </p>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => handleTestLed(1, 'red')}
                disabled={testingCmd === 'led-1-red'}
                className="w-full py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-rose-400 border border-rose-500/30 transition-all disabled:opacity-50"
              >
                {testingCmd === 'led-1-red' ? 'Flashing Slot 1 Red...' : 'Test Slot 1 LED (Red)'}
              </button>
              <button
                onClick={() => handleTestLed(2, 'red')}
                disabled={testingCmd === 'led-2-red'}
                className="w-full py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-rose-400 border border-rose-500/30 transition-all disabled:opacity-50"
              >
                {testingCmd === 'led-2-red' ? 'Flashing Slot 2 Red...' : 'Test Slot 2 LED (Red)'}
              </button>
            </div>
          </div>

          {/* LED Override Tests (Slots 3 & 4) */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                <h4 className="font-bold text-sm text-white">Slots 3 & 4 Indicator LEDs</h4>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Overrides and flashes the physical dual red/green LEDs on Slots 3 and 4 for 1.5 seconds.
              </p>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => handleTestLed(3, 'red')}
                disabled={testingCmd === 'led-3-red'}
                className="w-full py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-rose-400 border border-rose-500/30 transition-all disabled:opacity-50"
              >
                {testingCmd === 'led-3-red' ? 'Flashing Slot 3 Red...' : 'Test Slot 3 LED (Red)'}
              </button>
              <button
                onClick={() => handleTestLed(4, 'red')}
                disabled={testingCmd === 'led-4-red'}
                className="w-full py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-rose-400 border border-rose-500/30 transition-all disabled:opacity-50"
              >
                {testingCmd === 'led-4-red' ? 'Flashing Slot 4 Red...' : 'Test Slot 4 LED (Red)'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
