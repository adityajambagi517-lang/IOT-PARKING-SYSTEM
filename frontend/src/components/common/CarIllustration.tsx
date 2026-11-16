import React from 'react';
import { motion } from 'framer-motion';

interface CarIllustrationProps {
  occupied: boolean;
  color?: string;
}

export const CarIllustration: React.FC<CarIllustrationProps> = ({ occupied, color = '#6366f1' }) => {
  return (
    <div className="relative w-full h-44 flex items-center justify-center overflow-hidden rounded-xl bg-slate-900/60 border border-slate-800/80">
      {/* Parking space ground markings */}
      <div className="absolute inset-x-6 top-3 bottom-3 border-2 border-dashed border-slate-700/60 rounded-lg pointer-events-none flex flex-col justify-between py-2">
        <div className="flex justify-between px-3 text-[10px] font-mono text-slate-500 uppercase tracking-widest">
          <span>[STOP LINE]</span>
          <span>[BAY LIMIT]</span>
        </div>
        <div className="flex justify-between px-3 text-[10px] font-mono text-slate-500 uppercase tracking-widest">
          <span>ENTRY &darr;</span>
          <span>SENSOR &bull;</span>
        </div>
      </div>

      {/* Ultrasonic sensor indicator at top of bay */}
      <div className="absolute top-2 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800/90 border border-slate-700 text-[10px] font-mono text-slate-400 z-10">
        <span className={`w-1.5 h-1.5 rounded-full ${occupied ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'}`} />
        <span>HC-SR04 RADAR</span>
      </div>

      {/* Car Animated Graphic */}
      {occupied ? (
        <motion.div
          key="car-parked"
          initial={{ y: 80, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 20 }}
          className="relative z-10 flex flex-col items-center"
        >
          {/* Top-down realistic vehicle illustration */}
          <svg width="90" height="150" viewBox="0 0 100 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-2xl">
            {/* Wheels */}
            <rect x="6" y="24" width="10" height="26" rx="4" fill="#0f172a" stroke="#334155" strokeWidth="2" />
            <rect x="84" y="24" width="10" height="26" rx="4" fill="#0f172a" stroke="#334155" strokeWidth="2" />
            <rect x="6" y="110" width="10" height="26" rx="4" fill="#0f172a" stroke="#334155" strokeWidth="2" />
            <rect x="84" y="110" width="10" height="26" rx="4" fill="#0f172a" stroke="#334155" strokeWidth="2" />

            {/* Chassis Body */}
            <rect x="14" y="8" width="72" height="144" rx="20" fill="url(#carGradient)" stroke="#38bdf8" strokeWidth="1.5" />

            {/* Front windshield */}
            <path d="M22 45 C32 40, 68 40, 78 45 L74 65 C64 62, 36 62, 26 65 Z" fill="#0284c7" fillOpacity="0.4" stroke="#38bdf8" strokeWidth="1" />

            {/* Roof */}
            <rect x="25" y="65" width="50" height="42" rx="6" fill="#0369a1" fillOpacity="0.2" />

            {/* Rear windshield */}
            <path d="M25 112 C35 115, 65 115, 75 112 L73 124 C65 126, 35 126, 27 124 Z" fill="#0284c7" fillOpacity="0.3" stroke="#38bdf8" strokeWidth="1" />

            {/* Headlights */}
            <rect x="20" y="8" width="14" height="6" rx="3" fill="#fef08a" className="animate-pulse" />
            <rect x="66" y="8" width="14" height="6" rx="3" fill="#fef08a" className="animate-pulse" />

            {/* Taillights */}
            <rect x="20" y="146" width="14" height="6" rx="3" fill="#ef4444" />
            <rect x="66" y="146" width="14" height="6" rx="3" fill="#ef4444" />

            {/* Gradients */}
            <defs>
              <linearGradient id="carGradient" x1="50" y1="8" x2="50" y2="152" gradientUnits="userSpaceOnUse">
                <stop stopColor="#1e293b" />
                <stop offset="0.5" stopColor="#0f172a" />
                <stop offset="1" stopColor="#020617" />
              </linearGradient>
            </defs>
          </svg>

          {/* Under-car shadow & status light */}
          <div className="w-24 h-3 bg-rose-500/20 blur-md rounded-full mt-[-6px]" />
        </motion.div>
      ) : (
        <motion.div
          key="car-vacant"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex flex-col items-center justify-center text-slate-500/70"
        >
          <div className="w-14 h-14 rounded-full border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-2">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">BAY AVAILABLE</span>
          <span className="text-[11px] text-slate-500">Ready for vehicle entry</span>
        </motion.div>
      )}
    </div>
  );
};
