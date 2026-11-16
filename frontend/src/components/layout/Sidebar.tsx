import React from 'react';
import { useParking } from '../../context/ParkingContext';
import { 
  LayoutDashboard, 
  Car, 
  LineChart, 
  History, 
  Cpu, 
  Presentation, 
  Settings, 
  Radio,
  ShieldCheck
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
}

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, slots, isHardwareMode, health } = useParking();

  const occupiedCount = slots.filter(s => s.occupied).length;

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'live', label: 'Live Parking', icon: Car, badge: `${occupiedCount}/${slots.length}` },
    { id: 'analytics', label: 'Analytics & Forecast', icon: LineChart },
    { id: 'history', label: 'Parking History', icon: History },
    { id: 'health', label: 'Device Health', icon: Cpu, badge: health?.esp32_connected ? 'OK' : 'OFF' },
    { id: 'demo', label: 'Demo Center', icon: Presentation },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-[#0c1222] border-r border-slate-800/80 flex flex-col justify-between flex-shrink-0 min-h-screen">
      {/* Brand Header */}
      <div>
        <div className="h-20 px-6 border-b border-slate-800/80 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base text-white tracking-tight">PARKPULSE</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-semibold border border-indigo-500/30">IoT</span>
            </div>
            <p className="text-[11px] text-slate-400">Smart Occupancy System</p>
          </div>
        </div>

        {/* Navigation Items */}
        <div className="py-6 px-3 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
            Platform Navigation
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span
                    className={`text-[11px] font-mono px-2 py-0.5 rounded-full font-semibold ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : item.badge === 'OK'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* System Footer Details */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/40 m-3 rounded-xl">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-400 font-medium">Zone & Lot</span>
          <span className="text-xs font-mono font-semibold text-slate-200 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">Lot A ({slots.length} Bays)</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400 font-medium">Data Pipeline</span>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isHardwareMode ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'}`} />
            <span className="text-[11px] font-mono font-medium text-slate-300">
              {isHardwareMode ? 'ESP32 Wire' : 'Sim / Wait'}
            </span>
          </div>
        </div>
        <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center gap-1 text-[11px] text-slate-500 justify-center">
          <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
          <span>College Evaluation Build v2.0</span>
        </div>
      </div>
    </aside>
  );
};
