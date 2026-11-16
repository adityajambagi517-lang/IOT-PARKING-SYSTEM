import React, { useEffect, useState, useMemo } from 'react';
import { ParkingSession, EventLog } from '../types';
import { 
  Download, 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  Calendar, 
  Clock, 
  Layers,
  ArrowUpDown,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export const ParkingHistory: React.FC = () => {
  const [sessions, setSessions] = useState<ParkingSession[]>([]);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [activeTab, setActiveTab] = useState<'sessions' | 'events'>('sessions');
  const [search, setSearch] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const [sessRes, evtRes] = await Promise.all([
          fetch('/api/sessions?limit=500'),
          fetch('/api/events?limit=500'),
        ]);

        if (sessRes.ok) {
          const data = await sessRes.json();
          setSessions(data);
        }
        if (evtRes.ok) {
          const data = await evtRes.json();
          setEvents(data);
        }
      } catch (e) {
        console.warn('Failed to load history:', e);
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleExportCsv = () => {
    setExportLoading(true);
    // Direct link to FastAPI CSV export endpoint
    window.location.href = '/api/events/export';
    setTimeout(() => setExportLoading(false), 1500);
  };

  // Filter and sort sessions
  const filteredSessions = useMemo(() => {
    return sessions
      .filter((s) => {
        if (selectedSlot !== 'all' && s.slot_id !== Number(selectedSlot)) return false;
        if (statusFilter === 'active' && !s.is_active) return false;
        if (statusFilter === 'completed' && s.is_active) return false;
        if (search) {
          const matchSlot = `bay ${s.slot_id}`.toLowerCase().includes(search.toLowerCase());
          const matchTime = s.start_ts.toLowerCase().includes(search.toLowerCase());
          if (!matchSlot && !matchTime) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const timeA = new Date(a.start_ts).getTime();
        const timeB = new Date(b.start_ts).getTime();
        return sortAsc ? timeA - timeB : timeB - timeA;
      });
  }, [sessions, selectedSlot, statusFilter, search, sortAsc]);

  // Paginate
  const totalPages = Math.ceil(filteredSessions.length / pageSize) || 1;
  const paginatedSessions = filteredSessions.slice((page - 1) * pageSize, page * pageSize);

  const formatDuration = (seconds: number | null) => {
    if (seconds === null || seconds === undefined) return 'Active session';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hrs > 0) return `${hrs}h ${remMins}m ${secs}s`;
    return `${remMins}m ${secs}s`;
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Export Action */}
      <div className="bg-[#0f172a] p-5 rounded-2xl border border-slate-800/80 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight">Audit & Historical Records</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Database-backed audit trail of all vehicle sessions, ultrasonic events, and durations
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          disabled={exportLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          <span>{exportLoading ? 'Generating CSV...' : 'Export Audit CSV'}</span>
        </button>
      </div>

      {/* Tabs & Filters Bar */}
      <div className="bg-[#0f172a] p-5 rounded-2xl border border-slate-800/80 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Sub-tabs: Sessions vs Raw Events */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800 w-fit">
            <button
              onClick={() => { setActiveTab('sessions'); setPage(1); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'sessions'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Parking Sessions ({sessions.length})
            </button>
            <button
              onClick={() => { setActiveTab('events'); setPage(1); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'events'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Raw Sensor Events ({events.length})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative max-w-xs w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search bay # or date..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>

        {/* Filter Dropdowns for Sessions */}
        {activeTab === 'sessions' && (
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-800/80 text-xs">
            {/* Slot Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">Slot:</span>
              <select
                value={selectedSlot}
                onChange={(e) => { setSelectedSlot(e.target.value); setPage(1); }}
                className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">All 4 Bays</option>
                <option value="1">Bay 1</option>
                <option value="2">Bay 2</option>
                <option value="3">Bay 3</option>
                <option value="4">Bay 4</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">All Sessions</option>
                <option value="active">Active Only</option>
                <option value="completed">Completed Only</option>
              </select>
            </div>

            {/* Sort Toggle */}
            <button
              onClick={() => setSortAsc(!sortAsc)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-indigo-400" />
              <span>{sortAsc ? 'Oldest First' : 'Newest First'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Table */}
      <div className="bg-[#0f172a] rounded-2xl border border-slate-800/80 shadow-lg overflow-hidden">
        {activeTab === 'sessions' ? (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Session ID</th>
                    <th className="py-3 px-4">Parking Bay</th>
                    <th className="py-3 px-4">Arrival Timestamp</th>
                    <th className="py-3 px-4">Departure Timestamp</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {paginatedSessions.length > 0 ? (
                    paginatedSessions.map((sess) => (
                      <tr key={sess.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 text-slate-500 font-medium">#{sess.id}</td>
                        <td className="py-3 px-4 font-bold text-white">Bay #{sess.slot_id}</td>
                        <td className="py-3 px-4 text-slate-300">
                          {new Date(sess.start_ts).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-slate-400">
                          {sess.end_ts ? new Date(sess.end_ts).toLocaleString() : '--- (Still Parked)'}
                        </td>
                        <td className="py-3 px-4 font-semibold text-indigo-300">
                          {formatDuration(sess.duration_seconds)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              sess.is_active
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {sess.is_active ? 'ACTIVE' : 'COMPLETED'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500 font-sans">
                        No parking sessions found matching current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div>
                Showing {(page - 1) * pageSize + 1} -{' '}
                {Math.min(page * pageSize, filteredSessions.length)} of {filteredSessions.length} sessions
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-mono px-2">
                  Page {page} of {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Event ID</th>
                  <th className="py-3 px-4">Slot</th>
                  <th className="py-3 px-4">Sensor Reading</th>
                  <th className="py-3 px-4">Occupancy State</th>
                  <th className="py-3 px-4">Sequence #</th>
                  <th className="py-3 px-4">Server Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {events.slice(0, 30).map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-4 text-slate-500">#{evt.id}</td>
                    <td className="py-2.5 px-4 font-bold text-white">Bay #{evt.slot_id}</td>
                    <td className="py-2.5 px-4 text-slate-300">{evt.distance_cm} cm</td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          evt.occupied
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        {evt.occupied ? 'OCCUPIED' : 'FREE'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-500">#{evt.seq ?? 0}</td>
                    <td className="py-2.5 px-4 text-slate-400">
                      {new Date(evt.received_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
