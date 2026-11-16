import React from 'react';
import { useParking } from '../context/ParkingContext';
import { 
  Settings as SettingsIcon, 
  ShieldCheck, 
  Sliders, 
  Server, 
  Cpu, 
  Info, 
  Layers,
  Lock
} from 'lucide-react';

export const Settings: React.FC = () => {
  const { health } = useParking();

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Settings Header */}
      <div className="bg-[#0f172a] p-5 rounded-2xl border border-slate-800/80 shadow-lg flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight">System &amp; Firmware Parameters</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Operational thresholds, edge filter parameters, and network communication configurations
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-xs text-slate-400">
          <Lock className="w-3.5 h-3.5 text-indigo-400" />
          <span>Production Config (Read-Only)</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Lot Configuration Panel */}
        <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800/80 shadow-lg space-y-4">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <span>Parking Zone &amp; Thresholds</span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400">Parking Lot Identifier:</span>
              <span className="font-mono font-bold text-white bg-slate-800 px-2.5 py-1 rounded">Lot A</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400">Monitored Slots:</span>
              <span className="font-mono font-bold text-white bg-slate-800 px-2.5 py-1 rounded">4 Bays</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400">Occupancy Distance Threshold:</span>
              <span className="font-mono font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded">
                &le; 20 cm
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400">Debounce Counter:</span>
              <span className="font-mono font-bold text-slate-300 bg-slate-800 px-2.5 py-1 rounded">
                3 Consecutive Cycles
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400">Median Filter Samples:</span>
              <span className="font-mono font-bold text-slate-300 bg-slate-800 px-2.5 py-1 rounded">
                5 Readings per cycle
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400">Heartbeat Interval:</span>
              <span className="font-mono font-bold text-slate-300 bg-slate-800 px-2.5 py-1 rounded">
                30,000 ms (30s)
              </span>
            </div>
          </div>
        </div>

        {/* MQTT Topics & Telemetry Channels */}
        <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800/80 shadow-lg space-y-4">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Server className="w-4 h-4 text-cyan-400" />
            <span>MQTT Protocol Channels</span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <div className="text-slate-400">Slot Telemetry Topic Pattern:</div>
              <code className="text-indigo-400 font-mono text-[11px] block mt-0.5">
                parking/A/slot/&#123;slot_id&#125;/state
              </code>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <div className="text-slate-400">Device Status &amp; LWT Channel:</div>
              <code className="text-cyan-400 font-mono text-[11px] block mt-0.5">
                parking/A/device/status
              </code>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <div className="text-slate-400">Actuator Command Channel:</div>
              <code className="text-amber-400 font-mono text-[11px] block mt-0.5">
                parking/A/cmd
              </code>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <div className="text-slate-400">WebSocket Endpoint:</div>
              <code className="text-emerald-400 font-mono text-[11px] block mt-0.5">
                ws://localhost:8000/ws
              </code>
            </div>
          </div>
        </div>

        {/* Hardware Pinout Protection Notice */}
        <div className="md:col-span-2 bg-[#0f172a] p-6 rounded-2xl border border-slate-800/80 shadow-lg space-y-4">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <span>Hardware Pinout Architecture (Fixed Firmware Reference)</span>
          </div>

          <p className="text-xs text-slate-400">
            For hardware integrity and safety during demonstration, GPIO pin configurations cannot be altered via the web interface.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <div className="font-bold text-white mb-1">Slot 1</div>
              <div className="text-slate-400 text-[11px]">TRIG: 5</div>
              <div className="text-slate-400 text-[11px]">ECHO: 34</div>
              <div className="text-emerald-400 text-[11px]">LED G: 13</div>
              <div className="text-rose-400 text-[11px]">LED R: 26</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <div className="font-bold text-white mb-1">Slot 2</div>
              <div className="text-slate-400 text-[11px]">TRIG: 18</div>
              <div className="text-slate-400 text-[11px]">ECHO: 35</div>
              <div className="text-emerald-400 text-[11px]">LED G: 12</div>
              <div className="text-rose-400 text-[11px]">LED R: 25</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <div className="font-bold text-white mb-1">Slot 3</div>
              <div className="text-slate-400 text-[11px]">TRIG: 19</div>
              <div className="text-slate-400 text-[11px]">ECHO: 32</div>
              <div className="text-emerald-400 text-[11px]">LED G: 14</div>
              <div className="text-rose-400 text-[11px]">LED R: 4</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
              <div className="font-bold text-white mb-1">Slot 4</div>
              <div className="text-slate-400 text-[11px]">TRIG: 23</div>
              <div className="text-slate-400 text-[11px]">ECHO: 33</div>
              <div className="text-emerald-400 text-[11px]">LED G: 27</div>
              <div className="text-rose-400 text-[11px]">LED R: 0</div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-400">Active Piezo Buzzer:</span>
            <span className="font-mono text-white font-bold">GPIO 2 (Default Duration 500ms)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
