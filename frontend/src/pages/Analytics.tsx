import React, { useEffect, useState } from 'react';
import { 
  HourlyStat, 
  DailyStat, 
  PredictResponse, 
  PredictRow,
  UtilizationItem, 
  AnalyticsSummary 
} from '../types';
import { 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid, 
  Area, 
  AreaChart 
} from 'recharts';
import { 
  Sparkles, 
  Clock, 
  TrendingUp, 
  Activity, 
  Calendar, 
  AlertCircle, 
  ShieldCheck, 
  CheckCircle2 
} from 'lucide-react';

export const Analytics: React.FC = () => {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [hourly, setHourly] = useState<HourlyStat[]>([]);
  const [daily, setDaily] = useState<DailyStat[]>([]);
  const [heatmap, setHeatmap] = useState<number[][]>([]);
  const [utilization, setUtilization] = useState<UtilizationItem[]>([]);
  const [predictData, setPredictData] = useState<PredictResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  useEffect(() => {
    const loadAllAnalytics = async () => {
      try {
        setLoading(true);
        const [sumRes, hourRes, dayRes, heatRes, utilRes, predRes] = await Promise.all([
          fetch('/api/analytics/summary'),
          fetch('/api/analytics/hourly?days=30'),
          fetch('/api/analytics/daily?days=30'),
          fetch('/api/analytics/heatmap?days=30'),
          fetch('/api/analytics/utilization?days=30'),
          fetch('/api/predict?hours=24'),
        ]);

        if (sumRes.ok) setSummary(await sumRes.json());
        if (hourRes.ok) setHourly(await hourRes.json());
        if (dayRes.ok) setDaily(await dayRes.json());
        if (heatRes.ok) {
          const rawHeat = await heatRes.json();
          // Backend returns 7x24 numeric matrix
          if (Array.isArray(rawHeat)) setHeatmap(rawHeat);
        }
        if (utilRes.ok) setUtilization(await utilRes.json());
        if (predRes.ok) setPredictData(await predRes.json());
      } catch (e) {
        console.warn('Analytics loading error:', e);
      } finally {
        setLoading(false);
      }
    };

    loadAllAnalytics();
  }, []);

  // Format hourly chart data
  const formattedHourly = hourly.map(item => ({
    hour: `${String(item.hour).padStart(2, '0')}:00`,
    occupancy: Math.round(item.avg_occupancy_pct ?? 0),
    sessions: item.session_count,
  }));

  // Format daily chart data
  const formattedDaily = daily.map(item => ({
    day: item.day_name,
    occupancy: Math.round(item.avg_occupancy_pct ?? 0),
    sessions: item.session_count,
  }));

  // Format forecast chart data
  const formattedForecast = (predictData?.forecast || []).map((p: PredictRow) => ({
    time: `${String(p.hour).padStart(2, '0')}:00`,
    predicted: Math.round(p.predicted),
    lower: Math.round(p.lower),
    upper: Math.round(p.upper),
  }));

  return (
    <div className="space-y-6">
      {/* ML Prediction Hero Card */}
      <div className="bg-gradient-to-r from-indigo-950/60 via-[#0f172a] to-cyan-950/40 p-6 rounded-2xl border border-indigo-500/30 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 flex-shrink-0 shadow-lg shadow-indigo-500/10">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white tracking-tight">
                  24-Hour Machine Learning Occupancy Forecast
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30">
                  {predictData?.model_type || 'RandomForestRegressor'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Trained on historical bay occupancy events, session durations, and temporal features (hour, day of week, rush-hour indicators).
              </p>
            </div>
          </div>

          {/* Recommended Arrival Time Banner */}
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-indigo-500/40 lg:text-right flex-shrink-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
              Best Time to Park Today
            </div>
            <div className="text-xl font-black text-emerald-400 font-mono mt-0.5">
              {predictData?.best_arrival_text || 'Morning (09:00 - 11:00)'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Lowest predicted congestion window
            </div>
          </div>
        </div>

        {/* 24h ML Forecast Line Chart */}
        <div className="mt-6 pt-4 border-t border-slate-800/80">
          <div className="text-xs font-semibold text-slate-400 mb-2 flex items-center justify-between">
            <span>Forecast Curve (Next 24 Hours) with Confidence Interval</span>
            <span className="text-[11px] font-mono text-slate-500">
              Source: {predictData?.model_source || 'RandomForest Regressor'}
            </span>
          </div>

          <div className="h-56 w-full">
            {formattedForecast.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={formattedForecast} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" stroke="#475569" fontSize={11} tickLine={false} />
                  <YAxis stroke="#475569" fontSize={11} tickLine={false} unit="%" domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(val: number, name: string) => [`${val}%`, name === 'predicted' ? 'Predicted Occupancy' : name]}
                  />
                  <Area type="monotone" dataKey="upper" stroke="transparent" fill="#38bdf8" fillOpacity={0.1} />
                  <Area type="monotone" dataKey="predicted" stroke="#38bdf8" strokeWidth={2.5} fill="url(#forecastGrad)" />
                  <Area type="monotone" dataKey="lower" stroke="transparent" fill="transparent" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                Generating ML occupancy forecast...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Charts: Hourly vs Daily */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hourly Occupancy Bar Chart */}
        <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Hourly Occupancy Distribution</h3>
              <p className="text-xs text-slate-400">Average bay occupancy across 24 hours (00:00 - 23:00)</p>
            </div>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={formattedHourly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="hour" stroke="#475569" fontSize={10} tickLine={false} />
                <YAxis stroke="#475569" fontSize={11} tickLine={false} unit="%" domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(val: number) => [`${val}%`, 'Avg Occupancy']}
                />
                <Bar dataKey="occupancy" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily Occupancy Trend */}
        <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Day-of-Week Occupancy</h3>
              <p className="text-xs text-slate-400">Average occupancy from Monday through Sunday</p>
            </div>
            <Calendar className="w-4 h-4 text-cyan-400" />
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={formattedDaily} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="day" stroke="#475569" fontSize={11} tickLine={false} />
                <YAxis stroke="#475569" fontSize={11} tickLine={false} unit="%" domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(val: number) => [`${val}%`, 'Avg Occupancy']}
                />
                <Line type="monotone" dataKey="occupancy" stroke="#06b6d4" strokeWidth={3} dot={{ r: 4, fill: '#06b6d4' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 7x24 Day vs Hour Heatmap */}
      <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800/80 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Day vs Hour Congestion Heatmap</h3>
            <p className="text-xs text-slate-400">7-Day &times; 24-Hour occupancy intensity matrix</p>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
            <span>Low (0%)</span>
            <div className="flex gap-1">
              <span className="w-3 h-3 rounded bg-slate-800" />
              <span className="w-3 h-3 rounded bg-indigo-950" />
              <span className="w-3 h-3 rounded bg-indigo-700" />
              <span className="w-3 h-3 rounded bg-indigo-500" />
              <span className="w-3 h-3 rounded bg-rose-500" />
            </div>
            <span>High (100%)</span>
          </div>
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="min-w-[650px] space-y-1.5">
            {/* Hour header */}
            <div className="grid grid-cols-[50px_repeat(24,1fr)] gap-1 text-[10px] font-mono text-slate-500 text-center">
              <div></div>
              {Array.from({ length: 24 }).map((_, h) => (
                <div key={h}>{h}</div>
              ))}
            </div>

            {/* Day rows */}
            {dayNames.map((dayName, dayIdx) => {
              const rowValues = heatmap[dayIdx] || Array(24).fill(0);
              return (
                <div key={dayName} className="grid grid-cols-[50px_repeat(24,1fr)] gap-1 items-center">
                  <div className="text-xs font-semibold text-slate-400">{dayName}</div>
                  {rowValues.map((val, hIdx) => {
                    const rounded = Math.round(val);
                    // Color scale
                    let bg = 'bg-slate-800/60';
                    if (rounded > 75) bg = 'bg-rose-500 text-white';
                    else if (rounded > 50) bg = 'bg-indigo-600 text-white';
                    else if (rounded > 25) bg = 'bg-indigo-800 text-indigo-200';
                    else if (rounded > 0) bg = 'bg-indigo-950 text-indigo-400';

                    return (
                      <div
                        key={hIdx}
                        className={`h-6 rounded text-[9px] font-mono flex items-center justify-center transition-colors cursor-pointer ${bg}`}
                        title={`${dayName} at ${hIdx}:00 — ${rounded}% occupancy`}
                      >
                        {rounded > 0 ? rounded : ''}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Per-Slot Utilization Ranking */}
      <div className="bg-[#0f172a] p-6 rounded-2xl border border-slate-800/80 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Slot Utilization Ranking</h3>
            <p className="text-xs text-slate-400">Comparing individual bay utilization efficiency</p>
          </div>
          <Activity className="w-4 h-4 text-emerald-400" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {utilization.length > 0 ? (
            utilization.map((item) => (
              <div key={item.slot_id} className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-sm text-slate-200">Bay #{item.slot_id}</span>
                  <span className="text-xs font-mono font-bold text-indigo-400">
                    {Math.round(item.utilization_pct)}%
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-2">
                  <div
                    className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.round(item.utilization_pct))}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>{item.session_count} sessions</span>
                  <span>{Math.round(item.total_parked_seconds / 60)} min parked</span>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-4 py-6 text-center text-slate-500 text-xs">
              Waiting for sufficient session history to calculate utilization.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
