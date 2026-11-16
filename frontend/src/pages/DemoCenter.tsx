import React, { useState } from 'react';
import { useParking } from '../context/ParkingContext';
import { MqttLiveMessage, Slot } from '../types';
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Play, 
  Terminal, 
  Cpu, 
  Wifi, 
  Radio, 
  Layers, 
  Server, 
  Database, 
  Activity, 
  Globe, 
  ArrowDown, 
  ArrowRight,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';

export const DemoCenter: React.FC = () => {
  const { health, wsConnected, slots, liveMessages, isHardwareMode, refreshData } = useParking();
  const [activeTab, setActiveTab] = useState<'checklist' | 'architecture' | 'stream'>('checklist');

  // Checklist evaluation
  const brokerOk = Boolean(health?.mqtt_connected);
  const backendOk = true; // since this page is running
  const esp32Ok = Boolean(health?.esp32_connected);
  const wsOk = wsConnected;
  const sensorsOk = slots.every((s: Slot) => s.distance_cm !== null && s.distance_cm !== undefined);
  const allReady = brokerOk && backendOk && wsOk;

  return (
    <div className="space-y-6">
      {/* Presentation Hero Header */}
      <div className="bg-gradient-to-r from-indigo-950/70 via-[#0f172a] to-slate-900 p-6 rounded-2xl border border-indigo-500/30 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              FACULTY EVALUATION MODE
            </span>
            <span className="text-xs text-slate-400">Live Stage Controller</span>
          </div>
          <h2 className="text-xl font-extrabold text-white tracking-tight mt-1">
            College Demonstration &amp; Architecture Center
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
            Real-time pipeline verification, live MQTT packet monitor, and end-to-end edge-to-cloud data flow.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-2 ${
            isHardwareMode 
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' 
              : 'bg-amber-500/10 border-amber-500/40 text-amber-400'
          }`}>
            <span className={`w-2.5 h-2.5 rounded-full ${isHardwareMode ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'}`} />
            <span>{isHardwareMode ? 'REAL HARDWARE CONNECTED' : 'SIMULATOR / WAITING MODE'}</span>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('checklist')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'checklist'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          1. Pre-Flight Checklist
        </button>
        <button
          onClick={() => setActiveTab('architecture')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'architecture'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          2. System Architecture Diagram
        </button>
        <button
          onClick={() => setActiveTab('stream')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'stream'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          3. Live MQTT Packet Stream ({liveMessages.length})
        </button>
      </div>

      {/* Tab 1: Pre-Flight Checklist */}
      {activeTab === 'checklist' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800/80 shadow-lg space-y-4">
            <h3 className="text-base font-bold text-white tracking-tight flex items-center justify-between">
              <span>System Verification Checklist</span>
              <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                allReady ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
              }`}>
                {allReady ? 'ALL SYSTEMS OPERATIONAL' : 'ACTIONS REQUIRED'}
              </span>
            </h3>

            <div className="space-y-3">
              {/* Check 1: MQTT Broker */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {brokerOk ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
                  )}
                  <div>
                    <div className="text-xs font-bold text-white">MQTT Broker (Port 1883)</div>
                    <div className="text-[11px] text-slate-400">
                      {brokerOk ? 'Running & accepting TCP connections' : 'Broker down. Run start_broker.bat'}
                    </div>
                  </div>
                </div>
                <span className="font-mono text-xs text-slate-300">{brokerOk ? 'OK' : 'FAIL'}</span>
              </div>

              {/* Check 2: FastAPI Backend */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-white">FastAPI ASGI Server (Port 8000)</div>
                    <div className="text-[11px] text-slate-400">Serving REST APIs and production SPA</div>
                  </div>
                </div>
                <span className="font-mono text-xs text-slate-300">OK</span>
              </div>

              {/* Check 3: WebSocket Streaming */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {wsOk ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
                  )}
                  <div>
                    <div className="text-xs font-bold text-white">WebSocket Stream (/ws)</div>
                    <div className="text-[11px] text-slate-400">
                      {wsOk ? 'Connected to live push notification channel' : 'Reconnecting to /ws...'}
                    </div>
                  </div>
                </div>
                <span className="font-mono text-xs text-slate-300">{wsOk ? 'OK' : 'OFFLINE'}</span>
              </div>

              {/* Check 4: ESP32 Hardware */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {esp32Ok ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                  )}
                  <div>
                    <div className="text-xs font-bold text-white">ESP32 DevKit Edge Controller</div>
                    <div className="text-[11px] text-slate-400">
                      {esp32Ok ? 'Online & publishing telemetry' : 'Waiting for ESP32 Wi-Fi heartbeat'}
                    </div>
                  </div>
                </div>
                <span className="font-mono text-xs text-slate-300">{esp32Ok ? 'ONLINE' : 'STANDBY'}</span>
              </div>

              {/* Check 5: 4 Sensors Initialized */}
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {sensorsOk ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                  )}
                  <div>
                    <div className="text-xs font-bold text-white">4 Ultrasonic Sensors Initialized</div>
                    <div className="text-[11px] text-slate-400">Bays 1 to 4 state mapped in SQLite store</div>
                  </div>
                </div>
                <span className="font-mono text-xs text-slate-300">{sensorsOk ? '4/4' : 'PARTIAL'}</span>
              </div>
            </div>
          </div>

          {/* Quick Presentation Protocol */}
          <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800/80 shadow-lg space-y-4 flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <span>Presentation Walkthrough Protocol</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Step-by-step procedure to showcase to faculty &amp; evaluators:
              </p>

              <ol className="mt-4 space-y-3 text-xs text-slate-300">
                <li className="flex gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-300 font-mono font-bold flex items-center justify-center flex-shrink-0">1</span>
                  <span>
                    <strong>Show Overview KPI Dashboard:</strong> Highlight real-time occupancy %, available bays, and architecture health indicators.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-300 font-mono font-bold flex items-center justify-center flex-shrink-0">2</span>
                  <span>
                    <strong>Trigger Ultrasonic Sensor:</strong> Place hand within 20 cm of Sensor 1. Show faculty that Bay 1 instantly turns Red (OCCUPIED) with actual distance in cm and live ticking timer.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-300 font-mono font-bold flex items-center justify-center flex-shrink-0">3</span>
                  <span>
                    <strong>Vacate Slot:</strong> Remove hand. Bay 1 immediately turns Green (FREE).
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-300 font-mono font-bold flex items-center justify-center flex-shrink-0">4</span>
                  <span>
                    <strong>Demonstrate Cloud-to-Edge Control:</strong> Click "Test Buzzer (500ms)" under Device Health to actuate physical buzzer.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-300 font-mono font-bold flex items-center justify-center flex-shrink-0">5</span>
                  <span>
                    <strong>Machine Learning &amp; Export:</strong> Switch to Analytics tab to explain 24h ML forecast and export session logs to CSV in History.
                  </span>
                </li>
              </ol>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>Need test traffic? Run simulator:</span>
              <code className="text-indigo-400 font-mono bg-black/50 px-2 py-1 rounded">
                start_simulator.bat
              </code>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: System Architecture Diagram */}
      {activeTab === 'architecture' && (
        <div className="bg-[#0f172a] p-8 rounded-2xl border border-slate-800/80 shadow-lg">
          <div className="text-center max-w-xl mx-auto mb-8">
            <h3 className="text-lg font-bold text-white tracking-tight">
              End-to-End IoT System Pipeline Architecture
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Data flow from physical ultrasonic distance sensing to cloud database and WebSocket push
            </p>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-center gap-3 overflow-x-auto py-6">
            {/* Step 1: Sensors */}
            <div className="w-36 p-4 rounded-xl bg-slate-900 border border-slate-800 text-center flex flex-col items-center">
              <Radio className="w-6 h-6 text-indigo-400 mb-2" />
              <div className="font-bold text-xs text-white">4x HC-SR04</div>
              <div className="text-[10px] text-slate-400 mt-1">Ultrasonic Sensors</div>
              <span className="text-[9px] font-mono text-indigo-400 mt-2 bg-indigo-950/60 px-1.5 py-0.5 rounded">
                Distance cm
              </span>
            </div>

            <ArrowRight className="w-5 h-5 text-slate-600 hidden md:block" />
            <ArrowDown className="w-5 h-5 text-slate-600 md:hidden" />

            {/* Step 2: ESP32 */}
            <div className="w-36 p-4 rounded-xl bg-slate-900 border border-slate-800 text-center flex flex-col items-center">
              <Cpu className="w-6 h-6 text-emerald-400 mb-2" />
              <div className="font-bold text-xs text-white">ESP32 DevKit</div>
              <div className="text-[10px] text-slate-400 mt-1">Median Filter + Debounce</div>
              <span className="text-[9px] font-mono text-emerald-400 mt-2 bg-emerald-950/60 px-1.5 py-0.5 rounded">
                Edge Compute
              </span>
            </div>

            <ArrowRight className="w-5 h-5 text-slate-600 hidden md:block" />
            <ArrowDown className="w-5 h-5 text-slate-600 md:hidden" />

            {/* Step 3: Wi-Fi MQTT */}
            <div className="w-36 p-4 rounded-xl bg-slate-900 border border-slate-800 text-center flex flex-col items-center">
              <Server className="w-6 h-6 text-cyan-400 mb-2" />
              <div className="font-bold text-xs text-white">MQTT Broker</div>
              <div className="text-[10px] text-slate-400 mt-1">Mosquitto / amqtt</div>
              <span className="text-[9px] font-mono text-cyan-400 mt-2 bg-cyan-950/60 px-1.5 py-0.5 rounded">
                Port 1883 TCP
              </span>
            </div>

            <ArrowRight className="w-5 h-5 text-slate-600 hidden md:block" />
            <ArrowDown className="w-5 h-5 text-slate-600 md:hidden" />

            {/* Step 4: FastAPI */}
            <div className="w-36 p-4 rounded-xl bg-slate-900 border border-slate-800 text-center flex flex-col items-center">
              <Layers className="w-6 h-6 text-indigo-400 mb-2" />
              <div className="font-bold text-xs text-white">FastAPI Core</div>
              <div className="text-[10px] text-slate-400 mt-1">Validation &amp; Logic</div>
              <span className="text-[9px] font-mono text-indigo-400 mt-2 bg-indigo-950/60 px-1.5 py-0.5 rounded">
                Async Python
              </span>
            </div>

            <ArrowRight className="w-5 h-5 text-slate-600 hidden md:block" />
            <ArrowDown className="w-5 h-5 text-slate-600 md:hidden" />

            {/* Step 5: Database & ML */}
            <div className="w-36 p-4 rounded-xl bg-slate-900 border border-slate-800 text-center flex flex-col items-center">
              <Database className="w-6 h-6 text-amber-400 mb-2" />
              <div className="font-bold text-xs text-white">SQLite + ML</div>
              <div className="text-[10px] text-slate-400 mt-1">Sessions &amp; Predict</div>
              <span className="text-[9px] font-mono text-amber-400 mt-2 bg-amber-950/60 px-1.5 py-0.5 rounded">
                RandomForest
              </span>
            </div>

            <ArrowRight className="w-5 h-5 text-slate-600 hidden md:block" />
            <ArrowDown className="w-5 h-5 text-slate-600 md:hidden" />

            {/* Step 6: Web Dashboard */}
            <div className="w-36 p-4 rounded-xl bg-indigo-950/50 border border-indigo-500/50 text-center flex flex-col items-center">
              <Globe className="w-6 h-6 text-white mb-2" />
              <div className="font-bold text-xs text-white">React Dashboard</div>
              <div className="text-[10px] text-slate-300 mt-1">WebSocket Sync</div>
              <span className="text-[9px] font-mono text-emerald-400 mt-2 bg-emerald-950/60 px-1.5 py-0.5 rounded">
                Live Sub-second
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Live MQTT Packet Stream */}
      {activeTab === 'stream' && (
        <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Live MQTT Telemetry Stream</h3>
              <p className="text-xs text-slate-400">Raw JSON payloads received across subscribed topics</p>
            </div>
            <span className="text-xs font-mono text-slate-400">
              Showing last 20 packets
            </span>
          </div>

          <div className="space-y-2 font-mono text-xs max-h-96 overflow-y-auto">
            {liveMessages.length > 0 ? (
              liveMessages.map((msg: MqttLiveMessage) => (
                <div key={msg.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-[11px]">{msg.timestamp}</span>
                    <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-semibold">
                      {msg.topic}
                    </span>
                  </div>
                  <div className="text-slate-300 truncate max-w-xl text-[11px]">
                    {JSON.stringify(msg.payload)}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-500 font-sans text-xs">
                Waiting for MQTT packets. Telemetry packets will appear here in real time as sensors update.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
