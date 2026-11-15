/* ============================================================
   Smart Parking Dashboard – app.js
   Vanilla JS, no build step. Chart.js 4.x loaded from CDN.
   ============================================================ */

'use strict';

// ── Constants ──────────────────────────────────────────────
const API_BASE = 'http://localhost:8000';
const WS_URL   = 'ws://localhost:8000/ws';

// ── State ──────────────────────────────────────────────────
const state = {
  slots:        [],
  summary:      null,
  hourly:       [],
  heatmap:      [],
  predict:      null,
  sessions:     [],
  health:       null,
  slotTimers:   {},        // slotId → { status, since (timestamp ms) }
  ws:           null,
  wsBackoff:    1000,
  wsReconnTimer: null,
  refreshTimer: null,
  tickTimer:    null,
  charts:       {},
};

// ── Theme ──────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeBtn(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next    = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeBtn(next);
}

function updateThemeBtn(theme) {
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
}

// ── Toast Notifications ────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 310);
  }, duration);
}

// ── WebSocket ──────────────────────────────────────────────
function connectWS() {
  if (state.ws && state.ws.readyState < 2) return; // already open/connecting

  try {
    state.ws = new WebSocket(WS_URL);
  } catch (e) {
    scheduleWSReconnect();
    return;
  }

  state.ws.onopen = () => {
    console.log('[WS] connected');
    state.wsBackoff = 1000;
    clearTimeout(state.wsReconnTimer);
  };

  state.ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      handleWSMessage(msg);
    } catch (_) { /* ignore malformed */ }
  };

  state.ws.onerror = () => {
    console.warn('[WS] error');
  };

  state.ws.onclose = () => {
    console.log('[WS] closed – reconnecting in', state.wsBackoff, 'ms');
    scheduleWSReconnect();
  };
}

function scheduleWSReconnect() {
  clearTimeout(state.wsReconnTimer);
  state.wsReconnTimer = setTimeout(() => {
    connectWS();
    state.wsBackoff = Math.min(state.wsBackoff * 2, 30000);
  }, state.wsBackoff);
}

function handleWSMessage(msg) {
  // Backend may push full or partial updates
  if (msg.type === 'slots'   || msg.slots)   updateSlotGrid(msg.slots || msg.data);
  if (msg.type === 'health'  || msg.health)  updateDeviceStatus(msg.health || msg.data);
  if (msg.type === 'summary' || msg.summary) updateKPIs(msg.summary || msg.data);
}

// ── Data Fetching ──────────────────────────────────────────
async function safeFetch(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('[fetch]', url, err);
    return null;
  }
}

async function fetchAll() {
  const [slots, summary, hourly, heatmap, predict, sessions, health] = await Promise.all([
    safeFetch(`${API_BASE}/api/slots`),
    safeFetch(`${API_BASE}/api/analytics/summary`),
    safeFetch(`${API_BASE}/api/analytics/hourly`),
    safeFetch(`${API_BASE}/api/analytics/heatmap`),
    safeFetch(`${API_BASE}/api/predict`),
    safeFetch(`${API_BASE}/api/sessions`),
    safeFetch(`${API_BASE}/api/health`),
  ]);

  if (slots)   { state.slots   = slots;   updateSlotGrid(slots); }
  if (summary) { state.summary = summary; updateKPIs(summary); updateInsights(summary.insights); updateAnomalies(summary.anomalies); }
  if (hourly)  { state.hourly  = hourly;  updateHourlyChart(hourly); }
  if (heatmap) { state.heatmap = heatmap; updateHeatmap(heatmap); }
  if (predict) { state.predict = predict; updateForecastChart(predict); }
  if (sessions){ state.sessions = sessions; updateSessionsTable(sessions); }
  if (health)  { state.health  = health;  updateDeviceStatus(health); }

  updateLastUpdated();
}

// ── Slot Cards ─────────────────────────────────────────────
function updateSlotGrid(slots) {
  if (!slots || !slots.length) return;
  const grid = document.getElementById('slot-grid');
  if (!grid) return;

  // Update timer tracking
  slots.forEach(slot => {
    const id = slot.slot_id ?? slot.id ?? slot.slot;
    const status = (slot.status || 'unknown').toLowerCase();
    const prev = state.slotTimers[id];
    if (!prev || prev.status !== status) {
      state.slotTimers[id] = {
        status,
        since: slot.last_changed
          ? new Date(slot.last_changed).getTime()
          : Date.now(),
      };
    }
  });

  grid.innerHTML = slots.map(slot => {
    const id     = slot.slot_id ?? slot.id ?? slot.slot;
    const status = (slot.status || 'unknown').toLowerCase();
    const dist   = slot.distance_cm != null ? `${slot.distance_cm} cm` : '—';
    const cls    = status === 'free' ? 'free' : status === 'occupied' ? 'occupied' : 'unknown';
    const label  = status === 'free' ? '✅ FREE' : status === 'occupied' ? '🔴 OCCUPIED' : '❓ UNKNOWN';

    return `
      <div class="slot-card ${cls}" id="slot-card-${id}" data-slot="${id}" data-status="${status}">
        <div class="slot-label">Slot</div>
        <div class="slot-number">${id}</div>
        <div class="slot-status-badge">${label}</div>
        <div class="slot-distance">📡 ${dist}</div>
        <div class="slot-timer" id="slot-timer-${id}">—</div>
        <div class="slot-actions">
          <button class="slot-btn" onclick="sendCmd(${id},'open')"  title="Open gate">🔓 Open</button>
          <button class="slot-btn" onclick="sendCmd(${id},'close')" title="Close gate">🔒 Close</button>
        </div>
      </div>`;
  }).join('');
}

// ── Duration Tick (every second) ──────────────────────────
function tickTimers() {
  Object.entries(state.slotTimers).forEach(([id, t]) => {
    const el = document.getElementById(`slot-timer-${id}`);
    if (!el) return;
    const mins = Math.floor((Date.now() - t.since) / 60000);
    const secs = Math.floor(((Date.now() - t.since) % 60000) / 1000);
    const label = t.status === 'free' ? 'Free for' : t.status === 'occupied' ? 'Occupied for' : '';
    el.textContent = label ? `${label} ${mins}m ${secs}s` : '—';
  });
}

// ── KPIs ───────────────────────────────────────────────────
function updateKPIs(summary) {
  if (!summary) return;

  const occ  = summary.occupancy_pct ?? summary.occupancy ?? null;
  const free = summary.free_slots    ?? null;
  const avg  = summary.avg_duration  ?? summary.avg_duration_min ?? null;
  const peak = summary.peak_hour     ?? null;

  setEl('kpi-occupancy',    occ  != null ? `${occ.toFixed(0)}%`     : '—');
  setEl('kpi-free',         free != null ? free                      : '—');
  setEl('kpi-avg-duration', avg  != null ? `${avg.toFixed(0)}`       : '—');
  setEl('kpi-peak',         peak != null ? formatHour(peak)          : '—');

  setEl('kpi-occupancy-sub', `of ${(summary.total_slots ?? 4)} slots occupied`);
  setEl('kpi-free-sub',      'available now');
  setEl('kpi-duration-sub',  'minutes per session');
  setEl('kpi-peak-sub',      'busiest time of day');
}

function formatHour(h) {
  if (h == null) return '—';
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12  = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${ampm}`;
}

// ── Hourly Chart ───────────────────────────────────────────
function updateHourlyChart(hourly) {
  const ctx = document.getElementById('hourly-chart');
  if (!ctx) return;

  // hourly: array of {hour, avg_occupancy} or just numbers indexed 0-23
  const labels = Array.from({ length: 24 }, (_, i) => formatHour(i));
  const data   = Array(24).fill(0);

  if (Array.isArray(hourly)) {
    hourly.forEach(row => {
      const h = row.hour ?? row.h;
      const v = row.avg_occupancy ?? row.occupancy ?? row.value ?? row;
      if (h != null && h >= 0 && h < 24) data[h] = v ?? 0;
    });
  }

  if (state.charts.hourly) {
    state.charts.hourly.data.datasets[0].data = data;
    state.charts.hourly.update('none');
    return;
  }

  state.charts.hourly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Avg Occupancy %',
        data,
        backgroundColor: data.map(v => v > 70 ? 'rgba(239,68,68,.75)' : v > 40 ? 'rgba(245,158,11,.75)' : 'rgba(99,102,241,.75)'),
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: {
        label: ctx => `${ctx.parsed.y.toFixed(1)}%`,
      }}},
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 10 }, maxRotation: 45 }, grid: { color: 'rgba(255,255,255,.04)' }},
        y: { min: 0, max: 100, ticks: { color: '#94a3b8', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,.06)' }},
      },
    },
  });
}

// ── Heatmap ────────────────────────────────────────────────
function updateHeatmap(heatmap) {
  const canvas = document.getElementById('heatmap-canvas');
  if (!canvas) return;

  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Build 7×24 matrix: data[day][hour]
  const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));

  if (Array.isArray(heatmap)) {
    heatmap.forEach(row => {
      const d = row.day_of_week ?? row.day;
      const h = row.hour;
      const v = row.avg_occupancy ?? row.occupancy ?? row.value ?? 0;
      if (d != null && h != null && d >= 0 && d < 7 && h >= 0 && h < 24) {
        matrix[d][h] = v;
      }
    });
  }

  // Draw custom heatmap on canvas
  const dpr    = window.devicePixelRatio || 1;
  const wrap   = canvas.parentElement;
  const W      = wrap.clientWidth  || 400;
  const H      = wrap.clientHeight || 220;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx2 = canvas.getContext('2d');
  ctx2.scale(dpr, dpr);

  const padL = 32, padT = 18, padR = 6, padB = 6;
  const cellW = (W - padL - padR) / 24;
  const cellH = (H - padT - padB) / 7;

  // Hour labels
  ctx2.font      = '8px Inter, sans-serif';
  ctx2.fillStyle = '#94a3b8';
  ctx2.textAlign = 'center';
  for (let h = 0; h < 24; h += 3) {
    ctx2.fillText(formatHour(h), padL + h * cellW + cellW / 2, padT - 4);
  }

  // Day labels
  ctx2.textAlign = 'right';
  ctx2.font = '9px Inter, sans-serif';
  for (let d = 0; d < 7; d++) {
    ctx2.fillStyle = '#94a3b8';
    ctx2.fillText(days[d], padL - 4, padT + d * cellH + cellH * 0.65);
  }

  // Cells
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const v = matrix[d][h];
      ctx2.fillStyle = heatColor(v);
      ctx2.fillRect(
        padL + h * cellW + 1,
        padT + d * cellH + 1,
        cellW - 2,
        cellH - 2
      );
    }
  }
}

function heatColor(v) {
  // 0 → cool indigo, 100 → hot red
  const t = Math.min(Math.max(v, 0), 100) / 100;
  if (t < 0.33) {
    // indigo → teal
    const r = Math.round(99  + (20  - 99)  * (t / 0.33));
    const g = Math.round(102 + (184 - 102) * (t / 0.33));
    const b = Math.round(241 + (166 - 241) * (t / 0.33));
    return `rgba(${r},${g},${b},0.85)`;
  } else if (t < 0.66) {
    const tt = (t - 0.33) / 0.33;
    const r = Math.round(20  + (245 - 20)  * tt);
    const g = Math.round(184 + (158 - 184) * tt);
    const b = Math.round(166 + (11  - 166) * tt);
    return `rgba(${r},${g},${b},0.85)`;
  } else {
    const tt = (t - 0.66) / 0.34;
    const r = Math.round(245 + (239 - 245) * tt);
    const g = Math.round(158 + (68  - 158) * tt);
    const b = Math.round(11  + (44  - 11)  * tt);
    return `rgba(${r},${g},${b},0.85)`;
  }
}

// ── Forecast Chart ─────────────────────────────────────────
function updateForecastChart(predict) {
  const ctx = document.getElementById('forecast-chart');
  if (!ctx || !predict) return;

  // predict.forecast: [{hour, occupancy, lower, upper}] or similar
  const forecast = predict.forecast ?? predict.predictions ?? [];
  const labels   = forecast.map((r, i) => {
    const h = r.hour ?? r.time ?? i;
    return typeof h === 'number' ? formatHour(h) : String(h);
  });
  const occ   = forecast.map(r => r.occupancy  ?? r.value ?? r.predicted ?? 0);
  const lower = forecast.map(r => r.lower      ?? r.lower_ci ?? null);
  const upper = forecast.map(r => r.upper      ?? r.upper_ci ?? null);

  // Best arrival time
  if (predict.best_arrival_time != null) {
    const el = document.getElementById('best-arrival');
    const tEl = document.getElementById('best-arrival-time');
    if (el && tEl) {
      tEl.textContent = formatHour(predict.best_arrival_time);
      el.style.display = 'inline-flex';
    }
  }

  const ciData = lower.map((l, i) => [l, upper[i]]).filter(([l, u]) => l != null && u != null);
  const hasCi  = ciData.length > 0;

  const datasets = [];

  if (hasCi) {
    // Upper bound (invisible, stacked)
    datasets.push({
      label: 'CI Upper',
      data: upper,
      borderColor: 'transparent',
      backgroundColor: 'transparent',
      fill: false,
      pointRadius: 0,
      order: 3,
    });
    // Lower bound fill to upper (CI band)
    datasets.push({
      label: 'Confidence Band',
      data: lower,
      borderColor: 'transparent',
      backgroundColor: 'rgba(99,102,241,0.15)',
      fill: '-1',
      pointRadius: 0,
      order: 2,
    });
  }

  datasets.push({
    label: 'Forecast Occupancy %',
    data: occ,
    borderColor: 'rgba(99,102,241,1)',
    backgroundColor: 'rgba(99,102,241,0.1)',
    borderWidth: 2.5,
    pointRadius: 3,
    pointHoverRadius: 6,
    tension: 0.4,
    fill: !hasCi,
    order: 1,
  });

  if (state.charts.forecast) {
    state.charts.forecast.data.labels = labels;
    state.charts.forecast.data.datasets = datasets;
    state.charts.forecast.update('none');
    return;
  }

  state.charts.forecast = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: '#94a3b8',
            font: { size: 11 },
            filter: item => item.text !== 'CI Upper',
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              if (ctx.dataset.label === 'CI Upper' || ctx.dataset.label === 'Confidence Band') return null;
              return `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1) ?? '?'}%`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 10 }, maxRotation: 45 }, grid: { color: 'rgba(255,255,255,.04)' }},
        y: { min: 0, max: 100, ticks: { color: '#94a3b8', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,.06)' }},
      },
    },
  });
}

// ── Sessions Table ─────────────────────────────────────────
function updateSessionsTable(sessions) {
  const tbody = document.getElementById('sessions-tbody');
  if (!tbody) return;

  if (!sessions || sessions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No sessions recorded yet</td></tr>';
    return;
  }

  const rows = sessions.slice(0, 10).map(s => {
    const slot  = s.slot_id ?? s.slot ?? '?';
    const start = formatDateTime(s.start_time ?? s.start);
    const end   = s.end_time ?? s.end ? formatDateTime(s.end_time ?? s.end) : '<em style="color:var(--success)">Active</em>';
    const dur   = s.duration_min != null ? `${Math.round(s.duration_min)} min` : s.duration ? `${Math.round(s.duration)} min` : '—';
    return `<tr>
      <td><span class="slot-chip">${slot}</span></td>
      <td>${start}</td>
      <td>${end}</td>
      <td>${dur}</td>
    </tr>`;
  }).join('');

  tbody.innerHTML = rows;
}

function formatDateTime(dt) {
  if (!dt) return '—';
  try {
    const d = new Date(dt);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (_) { return String(dt); }
}

// ── Device Status ──────────────────────────────────────────
function updateDeviceStatus(health) {
  if (!health) return;
  const badge = document.getElementById('device-badge');
  const label = document.getElementById('device-label');
  if (!badge || !label) return;

  const online = health.status === 'online' || health.mqtt_connected === true || health.healthy === true;
  badge.className = `device-badge ${online ? 'online' : 'offline'}`;

  const lastSeen = health.last_seen ?? health.last_updated;
  const ago      = lastSeen ? timeSince(new Date(lastSeen)) : null;
  label.textContent = online
    ? `Online${ago ? ' · ' + ago : ''}`
    : `Offline${ago ? ' · last ' + ago : ''}`;

  // Simulator indicator
  updateSimBadge(health);
}

function updateSimBadge(health) {
  const badge = document.getElementById('sim-badge');
  if (!badge) return;
  const isSim = health.source === 'simulator'
    || health.simulator === true
    || health.device_type === 'simulator';
  badge.className = `sim-badge ${isSim ? 'simulator' : 'real'}`;
  badge.textContent = isSim ? '🔧 SIMULATOR' : '📡 REAL DEVICE';
}

function timeSince(date) {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60)   return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

// ── Insights ───────────────────────────────────────────────
function updateInsights(insights) {
  const container = document.getElementById('insights-container');
  if (!container) return;

  if (!insights || insights.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div>No insights yet</div>';
    return;
  }

  container.innerHTML = insights.map(ins => {
    const text = typeof ins === 'string' ? ins : ins.message ?? ins.text ?? JSON.stringify(ins);
    return `<div class="insight-item"><span class="insight-icon">💡</span><span>${text}</span></div>`;
  }).join('');
}

// ── Anomalies ──────────────────────────────────────────────
function updateAnomalies(anomalies) {
  const container = document.getElementById('anomalies-container');
  if (!container) return;

  if (!anomalies || anomalies.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div>No anomalies detected</div>';
    return;
  }

  container.innerHTML = anomalies.map(a => {
    const text = typeof a === 'string' ? a : a.message ?? a.text ?? JSON.stringify(a);
    return `<div class="anomaly-item"><span class="insight-icon">⚠️</span><span>${text}</span></div>`;
  }).join('');
}

// ── Commands ───────────────────────────────────────────────
async function sendCmd(slot, command) {
  try {
    const res = await fetch(`${API_BASE}/api/cmd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot_id: slot, command }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    showToast(`Slot ${slot}: ${command} → ${data.status ?? 'OK'}`, 'success');
  } catch (err) {
    showToast(`Command failed: ${err.message}`, 'error');
  }
}

async function retrainModel() {
  try {
    const res = await fetch(`${API_BASE}/api/predict/retrain`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast('Model retrain started', 'info');
  } catch (err) {
    showToast(`Retrain failed: ${err.message}`, 'warning');
  }
}

// ── CSV Export ─────────────────────────────────────────────
function exportCSV() {
  window.open(`${API_BASE}/api/export.csv`, '_blank');
  showToast('CSV download started', 'success');
}

// ── Last Updated ───────────────────────────────────────────
function updateLastUpdated() {
  const el = document.getElementById('last-updated-time');
  if (el) el.textContent = new Date().toLocaleTimeString();
}

// ── Helpers ────────────────────────────────────────────────
function setEl(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// ── Init ───────────────────────────────────────────────────
function init() {
  initTheme();

  // Theme toggle button
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  // Initial data load
  fetchAll();

  // Connect WebSocket
  connectWS();

  // Refresh data every 30s
  state.refreshTimer = setInterval(fetchAll, 30_000);

  // Tick duration timers every second
  state.tickTimer = setInterval(tickTimers, 1_000);
}

// Wait for DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
