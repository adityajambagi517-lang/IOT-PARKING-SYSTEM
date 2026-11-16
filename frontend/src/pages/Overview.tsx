import React, { useEffect, useState } from 'react';
import { useParking } from '../context/ParkingContext';
import { AnalyticsSummary, EventLog, Slot } from '../types';
import { 
  Car, 
  CheckCircle, 
  Clock, 
  TrendingUp, 
  Activity, 
  Cpu, 
  Server, 
  Database, 
  ArrowUpRight,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

export const Overview: React.FC = () => {
  const { slots, health, wsConnected, isHardwareMode, setActiveTab } = useParking();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [recentEvents, setRecentEvents] = useState<EventLog[]>([]);
  const [chartData, setChartData] = useState<{ time: string; occupancy: number }[]>([]);

  const occupiedCount = slots.filter((s: Slot) => s.occupied).length;
  const freeCount = slots.length - occupiedCount;
  const occupancyPct = Math.round((occupiedCount / slots.length) * 100);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const res = await fetch('/api/analytics/summary');
        if (res.ok) {
          const data: AnalyticsSummary = await res.json();
          setSummary(data);
        }
      } catch (e) {
        console.warn('Failed to load summary:', e);
      }
    };

    const fetchEvents = async () => {
      try {
        const res = await fetch('/api/events?limit=8');
        if (res.ok) {
          const data: EventLog[] = await res.json();
          setRecentEvents(data);
        }
      } catch (e) {
        console.warn('Failed to load events:', e);
      }
    };

    const fetchHourly = async () => {
      try {
        const res = await fetch('/api/analytics/hourly?days=7');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setChartData(
              data.map((item: any) => ({
                time: `${String(item.hour).padStart(2, '0')}:00`,
                occupancy: item.avg_occupancy_pct ?? Math.round(item.avg_occupancy ?? 0),
              }))
            );
          }
        }
      } catch (e) {
        console.warn('Failed to load hourly stats:', e);
      }
    };

    fetchSummary();
    fetchEvents();
    fetchHourly();

    const interval = setInterval(() => {
      fetchSummary();
      fetchEvents();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Hardware / Simulator State Alert Banner */}
      <div className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${
        isHardwareMode 
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
          : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isHardwareMode ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'}`} />
          <div>
            <h4 className="font-semibold text-sm">
              {isHardwareMode 
                ? 'Physical Hardware Sensing Active (ESP32 DevKit V1)' 
                : 'Waiting for Physical ESP32 Hardware or Running in Demonstration / Simulator Mode'}
            </h4>
            <p className="text-xs opacity-80 mt-0.5">
              {isHardwareMode 
                ? 'Receiving sub-second ultrasonic distance telemetry across HC-SR04 sensors.' 
                : 'Double-click start_simulator.bat to inject live test car arrivals or connect ESP32 to Wi-Fi.'}
            </p>
          </div>
        </div>
        <button 
          onClick={() => setActiveTab('demo')}
          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-all border border-white/20"
        >
          View Demo Checklist &rarr;
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        {/* Total Slots */}
        <div className="bg-[#0f172a] p-5 rounded-2xl border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Slots</span>
            <Car className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-3xl font-extrabold text-white font-mono">{slots.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">Lot A Capacity</div>
        </div>

        {/* Occupied Slots */}
        <div className="bg-[#0f172a] p-5 rounded-2xl border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Occupied</span>
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
          </div>
          <div className="text-3xl font-extrabold text-rose-400 font-mono">{occupiedCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">{occupancyPct}% of capacity</div>
        </div>

        {/* Available Slots */}
        <div className="bg-[#0f172a] p-5 rounded-2xl border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Available</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-400 font-mono">{freeCount}</div>
          <div className="text-[11px] text-emerald-500/80 mt-1">Ready for parking</div>
        </div>

        {/* Occupancy % */}
        <div className="bg-[#0f172a] p-5 rounded-2xl border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Occupancy Rate</span>
            <TrendingUp className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-extrabold text-cyan-400 font-mono">{occupancyPct}%</div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div 
              className="bg-cyan-500 h-full rounded-full transition-all duration-500" 
              style={{ width: `${occupancyPct}%` }}
            />
          </div>
        </div>

        {/* Active Sessions */}
        <div className="bg-[#0f172a] p-5 rounded-2xl border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Sessions</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-extrabold text-white font-mono">{occupiedCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">Total {summary?.total_sessions ?? 0} logged</div>
        </div>

        {/* Avg Duration */}
        <div className="bg-[#0f172a] p-5 rounded-2xl border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Avg Duration</span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-3xl font-extrabold text-indigo-400 font-mono">
            {summary?.avg_duration ?? 0}
            <span className="text-sm font-sans text-slate-400 ml-1">m</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Peak: {summary?.peak_hour ?? 14}:00</div>
        </div>
      </div>

      {/* Main Grid: Live Slot Mini View + Occupancy Profile Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Quick Bay Visualizer */}
        <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800/80 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">Bay Quick View</h3>
                <p className="text-xs text-slate-400">4 Monitored Parking Spaces</p>
              </div>
              <button 
                onClick={() => setActiveTab('live')}
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <span>Full Interactive View</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {slots.map((s: Slot) => (
                <div
                  key={s.slot_id}
                  onClick={() => setActiveTab('live')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all hover:scale-[1.02] ${
                    s.occupied
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                      : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1 font-semibold">
                    <span>Bay #{s.slot_id}</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/40">
                      {s.occupied ? `${s.distance_cm} cm` : 'VACANT'}
                    </span>
                  </div>
                  <div className="text-lg font-bold tracking-tight">
                    {s.occupied ? 'OCCUPIED' : 'FREE'}
                  </div>
                  <div className="text-[10px] opacity-75 mt-1">
                    {s.occupied ? 'Vehicle Present' : 'Ready to Park'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Infrastructure Health Sub-panel */}
          <div className="mt-6 pt-4 border-t border-slate-800/80">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Infrastructure Node Status
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800">
                <Cpu className={`w-4 h-4 ${health?.esp32_connected ? 'text-emerald-400' : 'text-rose-400'}`} />
                <div className="truncate">
                  <div className="font-semibold text-slate-200">ESP32 DevKit</div>
                  <div className="text-[10px] text-slate-400">{health?.esp32_connected ? 'Online' : 'Offline'}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800">
                <Server className={`w-4 h-4 ${health?.mqtt_connected ? 'text-cyan-400' : 'text-slate-500'}`} />
                <div className="truncate">
                  <div className="font-semibold text-slate-200">MQTT Broker</div>
                  <div className="text-[10px] text-slate-400">{health?.mqtt_connected ? 'Port 1883' : 'Down'}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800">
                <Activity className={`w-4 h-4 ${wsConnected ? 'text-indigo-400' : 'text-rose-400'}`} />
                <div className="truncate">
                  <div className="font-semibold text-slate-200">WebSocket</div>
                  <div className="text-[10px] text-slate-400">{wsConnected ? 'Sub-second' : 'Off'}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800">
                <Database className={`w-4 h-4 ${health?.db_ok ? 'text-emerald-400' : 'text-rose-400'}`} />
                <div className="truncate">
                  <div className="font-semibold text-slate-200">SQLite DB</div>
                  <div className="text-[10px] text-slate-400">{health?.db_ok ? 'Healthy' : 'Error'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: 24-Hour Occupancy Profile Area Chart */}
        <div className="lg:col-span-2 bg-[#0f172a] p-6 rounded-2xl border border-slate-800/80 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">Hourly Occupancy Profile</h3>
                <p className="text-xs text-slate-400">Average historical lot occupancy by hour of day</p>
              </div>
              <span className="text-xs font-mono font-medium text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
                Peak: {summary?.peak_hour ?? 14}:00
              </span>
            </div>

            <div className="h-64 w-full">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="occupancyGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" stroke="#475569" fontSize={11} tickLine={false} />
                    <YAxis stroke="#475569" fontSize={11} tickLine={false} unit="%" domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', fontSize: '12px' }}
                      formatter={(val: number) => [`${val}%`, 'Occupancy']}
                    />
                    <Area type="monotone" dataKey="occupancy" stroke="#6366f1" strokeWidth={2.5} fillOpacity={1} fill="url(#occupancyGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                  Loading occupancy profile...
                </div>
              )}
            </div>
          </div>

          {/* Real-time Insights Bar */}
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center gap-3 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>
              {summary?.insights?.[0] || 'System functioning normally. Sensor signals debounced with median filter.'}
            </span>
          </div>
        </div>
      </div>

      {/* Recent Vehicle Activity Timeline */}
      <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800/80 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Recent Vehicle Influx / Outflux</h3>
            <p className="text-xs text-slate-400">Live stream of ultrasonic detection events recorded into database</p>
          </div>
          <button 
            onClick={() => setActiveTab('history')}
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            <span>Full History Audit Log</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="py-2.5 px-3">Slot #</th>
                <th className="py-2.5 px-3">State Event</th>
                <th className="py-2.5 px-3">Ultrasonic Distance</th>
                <th className="py-2.5 px-3">Packet Seq</th>
                <th className="py-2.5 px-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {recentEvents.length > 0 ? (
                recentEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-200">Bay #{evt.slot_id}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        evt.occupied 
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' 
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {evt.occupied ? 'VEHICLE ARRIVED (OCCUPIED)' : 'VEHICLE DEPARTED (FREE)'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{evt.distance_cm} cm</td>
                    <td className="py-2.5 px-3 text-slate-500">#{evt.seq ?? 0}</td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {new Date(evt.received_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500 font-sans">
                    Waiting for sensor events. Turn on simulator or trigger ultrasonic sensor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
