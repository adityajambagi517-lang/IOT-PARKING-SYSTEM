import React from 'react';
import { useParking } from '../context/ParkingContext';
import { CarIllustration } from '../components/common/CarIllustration';
import { Slot } from '../types';
import { 
  Clock, 
  Ruler, 
  Wifi, 
  Lightbulb, 
  AlertCircle, 
  CheckCircle2, 
  Radio, 
  ShieldCheck 
} from 'lucide-react';

export const LiveParking: React.FC = () => {
  const { slots, durations, isHardwareMode, sendCommand } = useParking();

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hrs > 0) {
      return `${hrs}h ${remMins}m ${secs}s`;
    }
    return `${String(remMins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleFlashLed = async (slotId: number) => {
    // Override LED red for diagnostic test
    await sendCommand('led', { slot: slotId, color: 'red', state: true });
    setTimeout(() => {
      sendCommand('led', { slot: slotId, color: 'red', state: false });
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* Top Status & Controls Header */}
      <div className="bg-[#0f172a] p-5 rounded-2xl border border-slate-800/80 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white uppercase tracking-wider">Lot A — Live Bays</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              4 Physical Bays Monitored
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            HC-SR04 ultrasonic sensors publish state to <code className="text-indigo-300 font-mono">parking/A/slot/&#123;id&#125;/state</code>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-slate-300 font-medium">Free (&gt;20 cm)</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span className="text-slate-300 font-medium">Occupied (&le;20 cm)</span>
          </div>
        </div>
      </div>

      {/* 4 Parking Bays Interactive Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {slots.map((slot: Slot) => {
          const isOccupied = slot.occupied;
          const durationSec = durations[slot.slot_id] || 0;
          const distance = slot.distance_cm;

          return (
            <div
              key={slot.slot_id}
              className={`relative bg-[#0f172a] rounded-2xl border transition-all duration-300 p-5 shadow-xl flex flex-col justify-between ${
                isOccupied
                  ? 'border-rose-500/50 shadow-rose-950/20'
                  : 'border-emerald-500/40 shadow-emerald-950/20'
              }`}
            >
              {/* Card Top: Bay Header & Status Pill */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black font-mono text-white tracking-tight">
                      BAY {slot.slot_id}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 uppercase">
                      (TRIG: #{slot.slot_id === 1 ? '5' : slot.slot_id === 2 ? '18' : slot.slot_id === 3 ? '19' : '23'})
                    </span>
                  </div>

                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      isOccupied
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 glow-rose'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 glow-emerald'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isOccupied ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'
                      }`}
                    />
                    <span>{isOccupied ? 'OCCUPIED' : 'FREE'}</span>
                  </div>
                </div>

                {/* Animated Parking Bay Graphic */}
                <CarIllustration occupied={isOccupied} />

                {/* Real-time Telemetry Stats */}
                <div className="mt-4 space-y-2.5">
                  {/* Ultrasonic Distance Gauge */}
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Ruler className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Distance Sensor</span>
                      </div>
                      <span className="font-mono font-bold text-white text-sm">
                        {distance !== null ? `${distance} cm` : '---'}
                      </span>
                    </div>

                    {/* Visual Distance Progress Bar */}
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          distance <= 20 ? 'bg-rose-500' : distance <= 50 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(5, (distance / 150) * 100))}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] font-mono text-slate-500 mt-1">
                      <span>0cm (Contact)</span>
                      <span className="text-amber-400 font-semibold">20cm (Trigger)</span>
                      <span>150cm (Max)</span>
                    </div>
                  </div>

                  {/* Duration Timer */}
                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Clock className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Occupied Duration</span>
                    </div>
                    <div className="font-mono font-bold text-sm text-indigo-300">
                      {isOccupied ? formatDuration(durationSec) : '00:00'}
                    </div>
                  </div>

                  {/* Sensor Health / Signal Info */}
                  <div className="px-3 py-2 rounded-xl bg-slate-900/40 border border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Radio className="w-3 h-3 text-slate-500" />
                      <span>Packet Seq: #{slot.seq ?? 0}</span>
                    </div>
                    <div className="font-mono">
                      {slot.ts ? new Date(slot.ts).toLocaleTimeString() : 'Waiting packet'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Card Action: Diagnostic Override */}
              <div className="mt-4 pt-3 border-t border-slate-800/80">
                <button
                  onClick={() => handleFlashLed(slot.slot_id)}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-xs font-semibold text-slate-300 hover:text-white border border-slate-700 transition-all active:scale-98"
                >
                  <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                  <span>Flash Slot {slot.slot_id} LED</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* College Evaluator Live Instruction Callout */}
      <div className="p-5 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 flex items-start gap-3.5 text-xs text-slate-300">
        <ShieldCheck className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold text-white text-sm tracking-tight mb-1">
            Faculty Demonstration Protocol
          </h4>
          <p className="leading-relaxed">
            Move an object or vehicle closer than <strong>20 cm</strong> to any physical HC-SR04 ultrasonic sensor.
            The ESP32 processes 5-sample median filtering with a 3-count debounce, triggers the local hardware LED,
            and publishes a lightweight JSON packet to MQTT. Within milliseconds, the corresponding bay above will flip to
            <span className="text-rose-400 font-bold ml-1">RED (OCCUPIED)</span>, display the real distance in cm, and start the persistent duration timer.
          </p>
        </div>
      </div>
    </div>
  );
};
