/* ============================================================
   Smart Parking IoT Management System — Frontend Application
   Vanilla JavaScript with Chart.js 4.4.x & Real-time WebSockets
   ============================================================ */

'use strict';

// ── Dynamic Network Configuration ──────────────────────────
// Adapts automatically to local machine, LAN IP (e.g. 192.168.X.X) or mobile
const isLocalFile = window.location.protocol === 'file:';
const defaultHost = 'localhost:8000';
const currentHost = isLocalFile ? defaultHost : (window.location.host || defaultHost);
const httpProto   = (window.location.protocol === 'https:') ? 'https:' : 'http:';
const wsProto     = (window.location.protocol === 'https:') ? 'wss:' : 'ws:';

const API_BASE = isLocalFile ? `http://${defaultHost}` : `${httpProto}//${currentHost}`;
const WS_URL   = isLocalFile ? `ws://${defaultHost}/ws` : `${wsProto}//${currentHost}/ws`;

// ── Application State ──────────────────────────────────────
const state = {
  currentView: 'overview',
  slots: [],
  summary: null,
  hourly: [],
  daily: [],
  heatmap: [],
  predict: null,
  sessions: [],
  events: [],
  health: null,
  slotTimers: {},         // slotId -> { occupied: bool, since: ms }
  ws: null,
  wsBackoff: 1000,
  wsReconnTimer: null,
  refreshTimer: null,
  tickTimer: null,
  charts: {},
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Navigation & View Switching ────────────────────────────
function initNavigation() {
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item, [data-nav]');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.getAttribute('data-view') || item.getAttribute('data-nav');
      if (view) switchView(view);
    });
  });

  // Mobile menu toggle
  const mobileBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('sidebar');
  const closeBtn = document.getElementById('sidebar-close-btn');

  if (mobileBtn && sidebar) {
    mobileBtn.addEventListener('click', () => sidebar.classList.add('mobile-open'));
  }
  if (closeBtn && sidebar) {
    closeBtn.addEventListener('click', () => sidebar.classList.remove('mobile-open'));
  }
}

function switchView(viewName) {
  state.currentView = viewName;

  // Update nav active classes
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => {
    if (el.getAttribute('data-view') === viewName) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Update view panel visibility
  document.querySelectorAll('.view-panel').forEach(panel => {
    if (panel.id === `view-${viewName}`) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
    }
  });

  // Update page title
  const titles = {
    'overview': 'System Overview',
    'live-parking': 'Live Parking Bays',
    'analytics': 'Occupancy Analytics',
    'history': 'Parking History & Events',
    'device-health': 'Device Health & Diagnostics',
  };
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = titles[viewName] || 'Dashboard';

  // Close mobile sidebar if open
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('mobile-open');

  // Trigger chart re-renders if switching into charts view
  if (viewName === 'analytics') {
    if (state.charts.hourly) state.charts.hourly.resize();
    if (state.charts.daily) state.charts.daily.resize();
    if (state.heatmap) renderHeatmap(state.heatmap);
  } else if (viewName === 'overview') {
    if (state.charts.overviewForecast) state.charts.overviewForecast.resize();
  }
}

// ── Theme Management ───────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('parkmaster-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcons(saved);

  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('parkmaster-theme', next);
      updateThemeIcons(next);
      if (state.charts.hourly) updateChartsTheme();
    });
  }
}

function updateThemeIcons(theme) {
  const darkIcon = document.getElementById('theme-icon-dark');
  const lightIcon = document.getElementById('theme-icon-light');
  if (darkIcon && lightIcon) {
    if (theme === 'dark') {
      darkIcon.style.display = 'block';
      lightIcon.style.display = 'none';
    } else {
      darkIcon.style.display = 'none';
      lightIcon.style.display = 'block';
    }
  }
}

function updateChartsTheme() {
  // Refresh chart scales color
  if (state.charts.hourly) state.charts.hourly.update();
  if (state.charts.daily) state.charts.daily.update();
  if (state.charts.overviewForecast) state.charts.overviewForecast.update();
  if (state.heatmap) renderHeatmap(state.heatmap);
}

// ── Toast Notifications ────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

// ── Real-time WebSocket Client ─────────────────────────────
function connectWebSocket() {
  if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  updateConnectionStatus('connecting');

  try {
    state.ws = new WebSocket(WS_URL);
  } catch (err) {
    console.warn('[WS] Connection init error:', err);
    scheduleWebSocketReconnect();
    return;
  }

  state.ws.onopen = () => {
    console.log('[WS] Connected to Smart Parking stream.');
    state.wsBackoff = 1000;
    clearTimeout(state.wsReconnTimer);
    updateConnectionStatus('connected');
  };

  state.ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    } catch (err) {
      console.warn('[WS] Malformed JSON:', err);
    }
  };

  state.ws.onerror = (err) => {
    console.warn('[WS] Socket error:', err);
  };

  state.ws.onclose = () => {
    console.log('[WS] Closed. Reconnecting in', state.wsBackoff, 'ms...');
    updateConnectionStatus('disconnected');
    scheduleWebSocketReconnect();
  };
}

function scheduleWebSocketReconnect() {
  clearTimeout(state.wsReconnTimer);
  state.wsReconnTimer = setTimeout(() => {
    connectWebSocket();
    state.wsBackoff = Math.min(state.wsBackoff * 1.5, 30000);
  }, state.wsBackoff);
}

function updateConnectionStatus(status) {
  const wsDot = document.getElementById('side-ws-dot');
  const wsText = document.getElementById('side-ws-status');
  if (wsDot && wsText) {
    if (status === 'connected') {
      wsDot.className = 'status-indicator active';
      wsText.textContent = 'Active (Live)';
    } else if (status === 'connecting') {
      wsDot.className = 'status-indicator';
      wsText.textContent = 'Connecting...';
    } else {
      wsDot.className = 'status-indicator';
      wsText.textContent = 'Disconnected';
    }
  }
}

// ── WebSocket Message Dispatcher ───────────────────────────
function handleWebSocketMessage(msg) {
  if (!msg) return;

  // 1. Initial snapshot of all slots
  if (msg.type === 'slots' && Array.isArray(msg.slots)) {
    state.slots = msg.slots;
    renderAllSlotCards(msg.slots);
    recalculateKPIsFromSlots(msg.slots);
    if (msg.device_status) {
      updateESP32Status(msg.device_status === 'online', msg.timestamp);
    }
    return;
  }

  // 2. Immediate individual slot state change from ESP32 via MQTT
  if (msg.type === 'slot_update') {
    handleIndividualSlotUpdate(msg);
    return;
  }

  // 3. Device status heartbeat / LWT
  if (msg.type === 'device_status') {
    const isOnline = msg.status === 'online';
    updateESP32Status(isOnline, msg.ts);
    return;
  }
}

// ── Live Slot State Handler (Instant UI Update) ────────────
function handleIndividualSlotUpdate(update) {
  const slotId = Number(update.slot ?? update.slot_id);
  const occupied = Boolean(update.occupied);
  const distance = update.distance_cm != null ? Number(update.distance_cm) : null;
  const rssi = update.rssi != null ? Number(update.rssi) : null;
  const seq = update.seq != null ? Number(update.seq) : null;
  const ts = update.ts || new Date().toISOString();

  // Find or create in state
  let slotObj = state.slots.find(s => Number(s.slot_id ?? s.id ?? s.slot) === slotId);
  if (!slotObj) {
    slotObj = { slot_id: slotId, slot: slotId, occupied, distance_cm: distance, rssi, seq, ts };
    state.slots.push(slotObj);
  } else {
    // Check if occupancy actually changed before updating timer
    const stateFlipped = slotObj.occupied !== occupied;
    slotObj.occupied = occupied;
    slotObj.status = occupied ? 'occupied' : 'free';
    slotObj.distance_cm = distance;
    slotObj.rssi = rssi;
    slotObj.seq = seq;
    slotObj.ts = ts;
    slotObj.last_changed = stateFlipped ? ts : (slotObj.last_changed || ts);

    // Update timer record ONLY when occupancy boolean flipped
    if (stateFlipped || !state.slotTimers[slotId]) {
      state.slotTimers[slotId] = {
        occupied: occupied,
        since: Date.now(),
      };
    }
  }

  // Instant card update in Live Parking & Overview
  updateSingleBayCard(slotId, slotObj);
  updateMiniSlotCard(slotId, slotObj);

  // Recalculate KPIs immediately without page reload
  recalculateKPIsFromSlots(state.slots);

  // ESP32 is actively publishing, so it is online!
  updateESP32Status(true, ts);
  if (rssi != null) updateWifiRSSI(rssi);

  // Update footer timestamp
  updateLastSyncedTime();
}

// ── Duration Timer Tick (Every 1 Second) ───────────────────
function tickDurationTimers() {
  const now = Date.now();
  Object.entries(state.slotTimers).forEach(([slotId, info]) => {
    const timerEl = document.getElementById(`bay-timer-${slotId}`);
    if (!timerEl) return;

    const elapsedMs = Math.max(0, now - (info.since || now));
    const totalSecs = Math.floor(elapsedMs / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const timeFormatted = `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;

    const statusLabel = info.occupied ? 'Occupied for' : 'Available for';
    timerEl.innerHTML = `<span>${statusLabel}</span> <strong>${timeFormatted}</strong>`;
  });
}

// ── Render Slot Cards ──────────────────────────────────────
function renderAllSlotCards(slots) {
  const liveGrid = document.getElementById('live-cards-grid');
  const overviewRow = document.getElementById('overview-slot-row');

  // Sort slots 1..4
  slots.sort((a, b) => Number(a.slot_id ?? a.slot) - Number(b.slot_id ?? b.slot));

  // Initialize timers if not set
  slots.forEach(s => {
    const sId = Number(s.slot_id ?? s.slot);
    const occ = Boolean(s.occupied);
    if (!state.slotTimers[sId]) {
      const sinceMs = s.last_changed ? new Date(s.last_changed).getTime() : (s.ts ? new Date(s.ts).getTime() : Date.now());
      state.slotTimers[sId] = { occupied: occ, since: sinceMs };
    }
  });

  if (liveGrid) {
    liveGrid.innerHTML = slots.map(s => createBayCardHTML(s)).join('');
  }
  if (overviewRow) {
    overviewRow.innerHTML = slots.map(s => createMiniSlotHTML(s)).join('');
  }

  // Update health sensors table
  updateHealthSensorsTable(slots);
}

function createBayCardHTML(s) {
  const slotId = Number(s.slot_id ?? s.slot);
  const occupied = Boolean(s.occupied);
  const stateCls = occupied ? 'occupied' : 'free';
  const stateLabel = occupied ? 'OCCUPIED' : 'FREE';
  const distText = s.distance_cm != null ? `${Number(s.distance_cm).toFixed(1)} cm` : '—';
  const seqText = s.seq != null ? `#${s.seq}` : '#0';
  const rssiText = s.rssi != null ? `${s.rssi} dBm` : '—';

  return `
    <div class="parking-bay-card ${stateCls}" id="live-card-${slotId}">
      <div class="bay-header">
        <span class="bay-slot-badge">Parking Bay 0${slotId}</span>
        <span class="bay-status-pill ${stateCls}" id="bay-pill-${slotId}">
          <span class="pill-dot"></span>
          ${stateLabel}
        </span>
      </div>

      <div class="bay-main-visual">
        <div class="bay-state-label ${stateCls}" id="bay-label-${slotId}">${stateLabel}</div>
      </div>

      <div class="bay-distance-box">
        <span class="dist-metric-label">HC-SR04 Distance:</span>
        <span class="dist-metric-value" id="bay-dist-${slotId}">${distText}</span>
      </div>

      <div class="bay-timer-badge" id="bay-timer-${slotId}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        <span>Duration:</span> <strong>0m 00s</strong>
      </div>

      <div class="bay-metadata-row">
        <span>Sequence: <strong id="bay-seq-${slotId}">${seqText}</strong></span>
        <span>RSSI: <strong id="bay-rssi-${slotId}">${rssiText}</strong></span>
      </div>
    </div>
  `;
}

function createMiniSlotHTML(s) {
  const slotId = Number(s.slot_id ?? s.slot);
  const occupied = Boolean(s.occupied);
  const stateCls = occupied ? 'occupied' : 'free';
  const stateLabel = occupied ? 'OCCUPIED' : 'AVAILABLE';
  const distText = s.distance_cm != null ? `${Number(s.distance_cm).toFixed(1)} cm` : '—';

  return `
    <div class="mini-slot-card ${stateCls}" id="mini-slot-${slotId}">
      <div class="mini-slot-id">Bay 0${slotId}</div>
      <div class="mini-slot-state ${stateCls}" id="mini-state-${slotId}">${stateLabel}</div>
      <div class="mini-slot-dist" id="mini-dist-${slotId}">${distText}</div>
    </div>
  `;
}

function updateSingleBayCard(slotId, s) {
  const card = document.getElementById(`live-card-${slotId}`);
  if (!card) return;

  const occupied = Boolean(s.occupied);
  const stateCls = occupied ? 'occupied' : 'free';
  const stateLabel = occupied ? 'OCCUPIED' : 'FREE';

  card.className = `parking-bay-card ${stateCls}`;

  const pill = document.getElementById(`bay-pill-${slotId}`);
  if (pill) {
    pill.className = `bay-status-pill ${stateCls}`;
    pill.innerHTML = `<span class="pill-dot"></span> ${stateLabel}`;
  }

  const label = document.getElementById(`bay-label-${slotId}`);
  if (label) {
    label.className = `bay-state-label ${stateCls}`;
    label.textContent = stateLabel;
  }

  const dist = document.getElementById(`bay-dist-${slotId}`);
  if (dist && s.distance_cm != null) {
    dist.textContent = `${Number(s.distance_cm).toFixed(1)} cm`;
  }

  const seq = document.getElementById(`bay-seq-${slotId}`);
  if (seq && s.seq != null) seq.textContent = `#${s.seq}`;

  const rssi = document.getElementById(`bay-rssi-${slotId}`);
  if (rssi && s.rssi != null) rssi.textContent = `${s.rssi} dBm`;
}

function updateMiniSlotCard(slotId, s) {
  const card = document.getElementById(`mini-slot-${slotId}`);
  if (!card) return;

  const occupied = Boolean(s.occupied);
  const stateCls = occupied ? 'occupied' : 'free';
  const stateLabel = occupied ? 'OCCUPIED' : 'AVAILABLE';

  card.className = `mini-slot-card ${stateCls}`;

  const stateEl = document.getElementById(`mini-state-${slotId}`);
  if (stateEl) {
    stateEl.className = `mini-slot-state ${stateCls}`;
    stateEl.textContent = stateLabel;
  }

  const dist = document.getElementById(`mini-dist-${slotId}`);
  if (dist && s.distance_cm != null) {
    dist.textContent = `${Number(s.distance_cm).toFixed(1)} cm`;
  }
}

// ── Recalculate KPIs from Live Slot Array ──────────────────
function recalculateKPIsFromSlots(slots) {
  if (!slots || !slots.length) return;
  const total = slots.length;
  const occupied = slots.filter(s => Boolean(s.occupied)).length;
  const free = total - occupied;
  const pct = Math.round((occupied / total) * 100);

  setVal('kpi-occupancy-val', `${pct}%`);
  setVal('kpi-occ-badge', `${pct}%`);
  setVal('kpi-occupied-count', occupied);
  setVal('kpi-free-count', free);
  setVal('kpi-free-val', free);

  const fill = document.getElementById('kpi-progress-fill');
  if (fill) fill.style.width = `${pct}%`;
}

// ── REST API Data Fetching ─────────────────────────────────
async function fetchAPI(endpoint) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[API] Failed fetching ${endpoint}:`, err.message);
    return null;
  }
}

async function loadAllData() {
  const [slots, summary, hourly, daily, heatmap, predict, sessions, events, health, utilization] = await Promise.all([
    fetchAPI('/api/slots'),
    fetchAPI('/api/analytics/summary'),
    fetchAPI('/api/analytics/hourly?days=30'),
    fetchAPI('/api/analytics/daily?days=30'),
    fetchAPI('/api/analytics/heatmap?days=30'),
    fetchAPI('/api/predict?hours=24'),
    fetchAPI('/api/sessions?limit=25'),
    fetchAPI('/api/events?limit=25'),
    fetchAPI('/api/health'),
    fetchAPI('/api/analytics/utilization?days=30'),
  ]);

  if (slots) {
    state.slots = slots;
    renderAllSlotCards(slots);
    recalculateKPIsFromSlots(slots);
  }

  if (summary) {
    state.summary = summary;
    renderSummaryData(summary);
  }

  if (hourly) {
    state.hourly = hourly;
    renderHourlyChart(hourly);
  }

  if (daily) {
    state.daily = daily;
    renderDailyChart(daily);
  }

  if (heatmap) {
    state.heatmap = heatmap;
    renderHeatmap(heatmap);
  }

  if (predict) {
    state.predict = predict;
    renderPredictionData(predict);
  }

  if (sessions) {
    state.sessions = sessions;
    renderSessionsTable(sessions);
  }

  if (events) {
    state.events = events;
    renderEventsTable(events);
  }

  if (health) {
    state.health = health;
    renderHealthStatus(health);
  }

  if (utilization) {
    renderUtilizationTable(utilization);
  }

  updateLastSyncedTime();
}

function renderUtilizationTable(utilization) {
  const tbody = document.getElementById('utilization-tbody');
  if (!tbody) return;

  if (!Array.isArray(utilization) || !utilization.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">No utilization records available yet.</td></tr>';
    return;
  }

  tbody.innerHTML = utilization.map((row, idx) => {
    const slotId = row.slot_id ?? (idx + 1);
    const rank = row.rank ?? (idx + 1);
    const utilPct = row.utilization_pct != null ? `${Number(row.utilization_pct).toFixed(1)}%` : '0.0%';
    const totalSess = row.total_sessions ?? 0;
    const avgSec = row.avg_duration_seconds != null ? `${Math.round(row.avg_duration_seconds / 60)} min` : '—';

    return `
      <tr>
        <td><strong>#${rank}</strong></td>
        <td>Bay 0${slotId}</td>
        <td><strong class="text-info">${utilPct}</strong></td>
        <td>${totalSess}</td>
        <td>${avgSec}</td>
      </tr>
    `;
  }).join('');
}

// ── Summary & KPI Rendering ────────────────────────────────
function renderSummaryData(summary) {
  if (summary.avg_duration != null || summary.avg_duration_min != null) {
    const avg = Number(summary.avg_duration ?? summary.avg_duration_min);
    setVal('kpi-duration-val', `${avg.toFixed(1)}m`);
  }

  if (summary.peak_hour != null) {
    setVal('kpi-peak-val', formatHourLabel(summary.peak_hour));
  }

  // Render Insights & Anomalies
  renderInsightsList(summary.insights || []);
  renderAnomaliesList(summary.anomalies || []);
}

// ── Insights & Anomalies Rendering ─────────────────────────
function renderInsightsList(insights) {
  const container = document.getElementById('analytics-insights-container');
  if (!container) return;

  if (!insights.length) {
    container.innerHTML = '<div class="insight-pill-item"><span>Gathering occupancy patterns...</span></div>';
    return;
  }

  container.innerHTML = insights.map(text => `
    <div class="insight-pill-item">
      <svg class="insight-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
      <span>${text}</span>
    </div>
  `).join('');
}

function renderAnomaliesList(anomalies) {
  const container = document.getElementById('analytics-anomalies-container');
  if (!container) return;

  if (!anomalies.length) {
    container.innerHTML = `
      <div class="insight-pill-item" style="border-color: var(--success-border); color: var(--success);">
        <svg class="insight-icon text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
        <span>No sensor anomalies or flapping detected. System stable.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = anomalies.map(a => {
    let msg = '';
    if (a.type === 'long_occupancy') {
      msg = `Slot ${a.slot_id} continuously occupied for ${a.duration_hours}h — verify physical presence.`;
    } else if (a.type === 'flapping') {
      msg = `Slot ${a.slot_id} rapid state flapping (${a.changes_last_hour} transitions/hr) — check sensor stability.`;
    } else {
      msg = `Anomaly on Slot ${a.slot_id}: ${JSON.stringify(a)}`;
    }
    return `
      <div class="anomaly-pill-item">
        <svg class="insight-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/></svg>
        <span>${msg}</span>
      </div>
    `;
  }).join('');
}

// ── Chart.js: Hourly Profile Chart ─────────────────────────
function renderHourlyChart(hourly) {
  const ctx = document.getElementById('analytics-hourly-chart');
  if (!ctx) return;

  // Format array 0..23 hours
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const labels = hours.map(h => formatHourLabel(h));
  const data = Array(24).fill(0);

  if (Array.isArray(hourly)) {
    hourly.forEach(row => {
      const h = Number(row.hour ?? row.h);
      // Fixed: reads avg_occupancy_pct as declared by backend
      const val = row.avg_occupancy_pct ?? row.avg_occupancy ?? row.occupancy ?? 0;
      if (h >= 0 && h < 24) data[h] = Number(val);
    });
  }

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
  const textColor = isDark ? '#94a3b8' : '#475569';

  if (state.charts.hourly) {
    state.charts.hourly.data.datasets[0].data = data;
    state.charts.hourly.update();
    return;
  }

  state.charts.hourly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Average Occupancy %',
        data,
        backgroundColor: data.map(v => v >= 75 ? 'rgba(239, 68, 68, 0.75)' : (v >= 40 ? 'rgba(245, 158, 11, 0.75)' : 'rgba(99, 102, 241, 0.75)')),
        borderRadius: 5,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `Avg Occupancy: ${ctx.parsed.y.toFixed(1)}%`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 10 }, maxRotation: 45 },
          grid: { color: gridColor }
        },
        y: {
          min: 0,
          max: 100,
          ticks: { color: textColor, callback: v => `${v}%` },
          grid: { color: gridColor }
        }
      }
    }
  });
}

// ── Chart.js: Daily Chart (Mon to Sun) ─────────────────────
function renderDailyChart(daily) {
  const ctx = document.getElementById('analytics-daily-chart');
  if (!ctx) return;

  const labels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const data = Array(7).fill(0);

  if (Array.isArray(daily)) {
    daily.forEach(row => {
      const d = Number(row.day_of_week ?? row.dow);
      const val = row.avg_occupancy_pct ?? row.avg_occupancy ?? 0;
      if (d >= 0 && d < 7) data[d] = Number(val);
    });
  }

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
  const textColor = isDark ? '#94a3b8' : '#475569';

  if (state.charts.daily) {
    state.charts.daily.data.datasets[0].data = data;
    state.charts.daily.update();
    return;
  }

  state.charts.daily = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Daily Occupancy %',
        data,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointBackgroundColor: '#10b981',
        pointRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `Avg Occupancy: ${ctx.parsed.y.toFixed(1)}%`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 11 } },
          grid: { color: gridColor }
        },
        y: {
          min: 0,
          max: 100,
          ticks: { color: textColor, callback: v => `${v}%` },
          grid: { color: gridColor }
        }
      }
    }
  });
}

// ── 7 x 24 Day-Hour Heatmap Matrix ─────────────────────────
function renderHeatmap(heatmapMatrix) {
  const canvas = document.getElementById('analytics-heatmap-canvas');
  if (!canvas) return;

  // The backend returns a 7 x 24 matrix of numbers: [row0=Mon...row6=Sun][col0=0h...col23=23h]
  const matrix = Array.from({ length: 7 }, (_, d) => {
    if (Array.isArray(heatmapMatrix) && Array.isArray(heatmapMatrix[d])) {
      return heatmapMatrix[d].map(Number);
    }
    return Array(24).fill(0);
  });

  const dpr = window.devicePixelRatio || 1;
  const wrap = canvas.parentElement;
  const W = wrap.clientWidth || 700;
  const H = wrap.clientHeight || 240;

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const padLeft = 45;
  const padTop = 22;
  const padRight = 10;
  const padBottom = 10;

  const cellW = (W - padLeft - padRight) / 24;
  const cellH = (H - padTop - padBottom) / 7;

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  ctx.font = '10px Plus Jakarta Sans, sans-serif';

  // Draw Hour labels along top (0, 3, 6, 9, 12, 15, 18, 21)
  ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
  ctx.textAlign = 'center';
  for (let h = 0; h < 24; h += 2) {
    const x = padLeft + h * cellW + cellW / 2;
    ctx.fillText(`${h}h`, x, padTop - 6);
  }

  // Draw Day labels along left (Mon to Sun)
  ctx.textAlign = 'right';
  for (let d = 0; d < 7; d++) {
    const y = padTop + d * cellH + cellH * 0.68;
    ctx.fillText(DAY_NAMES[d], padLeft - 8, y);
  }

  // Draw Heatmap Cells
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const val = matrix[d][h] || 0;
      ctx.fillStyle = getHeatmapCellColor(val, isDark);
      ctx.beginPath();
      ctx.roundRect(
        padLeft + h * cellW + 1,
        padTop + d * cellH + 1,
        Math.max(1, cellW - 2),
        Math.max(1, cellH - 2),
        2
      );
      ctx.fill();
    }
  }
}

function getHeatmapCellColor(pct, isDark) {
  const norm = Math.min(Math.max(pct, 0), 100) / 100;
  if (norm === 0) return isDark ? '#161f33' : '#e2e8f0';

  if (norm < 0.35) {
    // Cool Blue
    return `rgba(59, 130, 246, ${0.35 + norm * 1.2})`;
  } else if (norm < 0.7) {
    // Amber
    return `rgba(245, 158, 11, ${0.45 + (norm - 0.35) * 1.5})`;
  } else {
    // Hot Red
    return `rgba(239, 68, 68, ${0.6 + (norm - 0.7) * 1.3})`;
  }
}

// ── ML Prediction & Forecast Charts ────────────────────────
function renderPredictionData(predict) {
  const forecast = predict.forecast || predict.predictions || [];
  if (!forecast.length) return;

  const isFallback = Boolean(predict.is_fallback);
  const modelTag = document.getElementById('overview-model-tag');
  if (modelTag) {
    modelTag.textContent = predict.model_type || (isFallback ? 'Fallback Baseline' : 'RandomForest Regressor');
    modelTag.className = `model-badge-tag ${isFallback ? 'warning' : ''}`;
  }

  const arrivalText = document.getElementById('overview-best-arrival-text');
  if (arrivalText) {
    arrivalText.textContent = predict.best_arrival_text || 'Optimal arrival time around 10:00 AM';
  }

  // Render Chart in Overview
  const ctx = document.getElementById('overview-forecast-chart');
  if (!ctx) return;

  const labels = forecast.map(f => {
    const d = new Date(f.ts);
    return isNaN(d) ? `${f.hour}h` : formatHourLabel(d.getHours());
  });

  const occ = forecast.map(f => Number(f.occupancy ?? f.predicted ?? 0));
  const lower = forecast.map(f => Number(f.lower ?? 0));
  const upper = forecast.map(f => Number(f.upper ?? 100));

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
  const textColor = isDark ? '#94a3b8' : '#475569';

  if (state.charts.overviewForecast) {
    state.charts.overviewForecast.data.labels = labels;
    state.charts.overviewForecast.data.datasets[0].data = upper;
    state.charts.overviewForecast.data.datasets[1].data = lower;
    state.charts.overviewForecast.data.datasets[2].data = occ;
    state.charts.overviewForecast.update();
    return;
  }

  state.charts.overviewForecast = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'CI Upper Bound',
          data: upper,
          borderColor: 'transparent',
          backgroundColor: 'transparent',
          pointRadius: 0,
          fill: false,
        },
        {
          label: '95% Confidence Interval',
          data: lower,
          borderColor: 'transparent',
          backgroundColor: 'rgba(99, 102, 241, 0.15)',
          pointRadius: 0,
          fill: '-1',
        },
        {
          label: 'Predicted Occupancy %',
          data: occ,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.08)',
          borderWidth: 2.5,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 6,
          fill: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: textColor,
            filter: item => item.text !== 'CI Upper Bound',
            font: { size: 10 }
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              if (ctx.dataset.label.includes('Upper')) return null;
              return `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 10 }, maxRotation: 45 },
          grid: { color: gridColor }
        },
        y: {
          min: 0,
          max: 100,
          ticks: { color: textColor, callback: v => `${v}%` },
          grid: { color: gridColor }
        }
      }
    }
  });
}

// ── Tables Rendering ───────────────────────────────────────
function renderSessionsTable(sessions) {
  const tbody = document.getElementById('history-sessions-tbody');
  if (!tbody) return;

  if (!sessions.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">No parking sessions recorded yet.</td></tr>';
    return;
  }

  tbody.innerHTML = sessions.map(s => {
    const slotId = s.slot_id ?? s.slot;
    const start = formatTimestamp(s.start_time);
    const end = s.end_time ? formatTimestamp(s.end_time) : '<span class="status-pill online">Active Now</span>';
    const duration = s.duration_min != null ? `${s.duration_min} min` : (s.duration_seconds ? `${Math.round(s.duration_seconds / 60)} min` : 'In Progress');
    const isCompleted = s.end_time != null;

    return `
      <tr>
        <td><strong>Bay 0${slotId}</strong></td>
        <td>${start}</td>
        <td>${end}</td>
        <td>${duration}</td>
        <td>
          <span class="status-pill ${isCompleted ? 'info' : 'online'}">
            ${isCompleted ? 'Completed' : 'Active Session'}
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

function renderEventsTable(events) {
  const tbody = document.getElementById('history-events-tbody');
  if (!tbody) return;

  if (!events.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No MQTT events recorded yet.</td></tr>';
    return;
  }

  tbody.innerHTML = events.map(e => {
    const occupied = Boolean(e.occupied);
    const stateBadge = occupied
      ? '<span class="status-pill offline">OCCUPIED</span>'
      : '<span class="status-pill online">FREE</span>';
    const dist = e.distance_cm != null ? `${Number(e.distance_cm).toFixed(1)} cm` : '—';
    const rssi = e.rssi != null ? `${e.rssi} dBm` : '—';
    const time = formatTimestamp(e.ts || e.received_at);

    return `
      <tr>
        <td>#${e.id}</td>
        <td>Bay 0${e.slot_id}</td>
        <td>${stateBadge}</td>
        <td><code>${dist}</code></td>
        <td>${rssi}</td>
        <td>#${e.seq ?? 0}</td>
        <td>${time}</td>
      </tr>
    `;
  }).join('');
}

function updateHealthSensorsTable(slots) {
  slots.forEach(s => {
    const id = Number(s.slot_id ?? s.slot);
    const pill = document.getElementById(`health-slot-${id}-pill`);
    const dist = document.getElementById(`health-slot-${id}-dist`);
    const time = document.getElementById(`health-slot-${id}-time`);

    if (pill) {
      const occ = Boolean(s.occupied);
      pill.className = `status-pill ${occ ? 'offline' : 'online'}`;
      pill.textContent = occ ? 'OCCUPIED' : 'FREE';
    }
    if (dist && s.distance_cm != null) {
      dist.textContent = `${Number(s.distance_cm).toFixed(1)} cm`;
    }
    if (time && s.ts) {
      time.textContent = formatTimestamp(s.ts);
    }
  });
}

// ── Device Health & Telemetry ──────────────────────────────
function renderHealthStatus(health) {
  const isESPOnline = Boolean(health.esp32_connected || health.status === 'online');
  const isBrokerOnline = Boolean(health.mqtt_connected);

  updateESP32Status(isESPOnline, health.last_seen || health.last_heartbeat);

  // Broker status
  const brokerPill = document.getElementById('pill-broker');
  const brokerText = document.getElementById('pill-broker-text');
  const sysBrokerPill = document.getElementById('sys-mqtt-pill');
  const healthBrokerDot = document.getElementById('health-broker-dot');
  const healthBrokerStatus = document.getElementById('health-broker-status');
  const sideBrokerDot = document.getElementById('side-mqtt-dot');
  const sideBrokerText = document.getElementById('side-mqtt-status');

  if (isBrokerOnline) {
    if (brokerPill) { brokerPill.className = 'status-pill online'; brokerText.textContent = 'Broker Connected'; }
    if (sysBrokerPill) { sysBrokerPill.className = 'status-pill online'; sysBrokerPill.textContent = 'Connected'; }
    if (healthBrokerDot) healthBrokerDot.className = 'status-indicator active';
    if (healthBrokerStatus) { healthBrokerStatus.className = 'health-main-status text-success'; healthBrokerStatus.textContent = 'Connected'; }
    if (sideBrokerDot) sideBrokerDot.className = 'status-indicator active';
    if (sideBrokerText) sideBrokerText.textContent = 'Connected';
  } else {
    if (brokerPill) { brokerPill.className = 'status-pill offline'; brokerText.textContent = 'Broker Offline'; }
    if (sysBrokerPill) { sysBrokerPill.className = 'status-pill offline'; sysBrokerPill.textContent = 'Disconnected'; }
    if (healthBrokerDot) healthBrokerDot.className = 'status-indicator';
    if (healthBrokerStatus) { healthBrokerStatus.className = 'health-main-status text-danger'; healthBrokerStatus.textContent = 'Disconnected'; }
    if (sideBrokerDot) sideBrokerDot.className = 'status-indicator';
    if (sideBrokerText) sideBrokerText.textContent = 'Offline';
  }

  // Uptime
  if (health.uptime_seconds != null) {
    const mins = Math.floor(health.uptime_seconds / 60);
    const hrs = Math.floor(mins / 60);
    setVal('health-uptime-val', `${hrs}h ${mins % 60}m`);
  }
}

function updateESP32Status(isOnline, lastSeenTs) {
  const pill = document.getElementById('pill-esp32');
  const pillText = document.getElementById('pill-esp32-text');
  const sysPill = document.getElementById('sys-esp32-pill');
  const sysLastSeen = document.getElementById('sys-esp32-lastseen');
  const healthDot = document.getElementById('health-esp32-dot');
  const healthStatus = document.getElementById('health-esp32-status');
  const healthLastSeen = document.getElementById('health-esp32-last-seen');
  const sideDot = document.getElementById('side-esp32-dot');
  const sideStatus = document.getElementById('side-esp32-status');

  const timeStr = lastSeenTs ? formatTimestamp(lastSeenTs) : 'Just now';

  if (isOnline) {
    if (pill) { pill.className = 'status-pill online'; pillText.textContent = 'ESP32 Online'; }
    if (sysPill) { sysPill.className = 'status-pill online'; sysPill.textContent = 'Online'; }
    if (sysLastSeen) sysLastSeen.textContent = `Heartbeat active (${timeStr})`;
    if (healthDot) healthDot.className = 'status-indicator active';
    if (healthStatus) { healthStatus.className = 'health-main-status text-success'; healthStatus.textContent = 'Online (Live)'; }
    if (healthLastSeen) healthLastSeen.textContent = timeStr;
    if (sideDot) sideDot.className = 'status-indicator active';
    if (sideStatus) sideStatus.textContent = 'Online';
  } else {
    if (pill) { pill.className = 'status-pill offline'; pillText.textContent = 'ESP32 Offline'; }
    if (sysPill) { sysPill.className = 'status-pill offline'; sysPill.textContent = 'Offline'; }
    if (sysLastSeen) sysLastSeen.textContent = lastSeenTs ? `Last seen ${timeStr}` : 'No heartbeat';
    if (healthDot) healthDot.className = 'status-indicator';
    if (healthStatus) { healthStatus.className = 'health-main-status text-danger'; healthStatus.textContent = 'Offline'; }
    if (healthLastSeen) healthLastSeen.textContent = lastSeenTs ? timeStr : 'Never';
    if (sideDot) sideDot.className = 'status-indicator';
    if (sideStatus) sideStatus.textContent = 'Offline';
  }
}

function updateWifiRSSI(rssi) {
  const rssiEl = document.getElementById('health-wifi-rssi');
  const qualityEl = document.getElementById('health-wifi-quality');
  if (rssiEl) rssiEl.textContent = `${rssi} dBm`;

  if (qualityEl) {
    if (rssi >= -50) qualityEl.textContent = 'Excellent Signal';
    else if (rssi >= -65) qualityEl.textContent = 'Good Signal';
    else if (rssi >= -75) qualityEl.textContent = 'Fair Signal';
    else qualityEl.textContent = 'Weak Signal';
  }
}

// ── Hardware Actuators Execution ───────────────────────────
async function triggerBuzzer(durationMs = 500) {
  showToast(`Actuating Buzzer for ${durationMs}ms...`, 'info', 2000);

  try {
    const res = await fetch(`${API_BASE}/api/cmd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'buzzer', duration_ms: durationMs })
    });

    const data = await res.json();
    if (res.ok && data.status === 'sent') {
      showToast(`Buzzer triggered (${durationMs}ms) successfully!`, 'success');
    } else {
      showToast(`Buzzer command queued (Status: ${data.status || 'Offline'})`, 'warning');
    }
  } catch (err) {
    showToast(`Buzzer actuation failed: ${err.message}`, 'danger');
  }
}

async function testLED(slotId, color, stateVal = true) {
  showToast(`Toggling ${color.toUpperCase()} LED on Slot ${slotId}...`, 'info', 2000);

  try {
    const res = await fetch(`${API_BASE}/api/cmd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cmd: 'led',
        slot: slotId,
        color: color,
        state: stateVal
      })
    });

    const data = await res.json();
    if (res.ok && data.status === 'sent') {
      showToast(`Slot ${slotId} ${color.toUpperCase()} LED command executed`, 'success');
    } else {
      showToast(`LED command dispatched (${data.status || 'Offline'})`, 'warning');
    }
  } catch (err) {
    showToast(`LED actuation error: ${err.message}`, 'danger');
  }
}

// ── Export CSV Action ──────────────────────────────────────
function exportCSV() {
  showToast('Preparing parking events CSV export...', 'info', 2000);
  window.open(`${API_BASE}/api/export.csv`, '_blank');
}

// ── Retrain Model Action ───────────────────────────────────
async function triggerModelRetrain() {
  showToast('Retraining RandomForestRegressor model...', 'info', 3000);
  try {
    const res = await fetch(`${API_BASE}/api/predict/retrain`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast('Model retraining complete!', 'success');
      // Refresh forecast
      const predict = await fetchAPI('/api/predict?hours=24');
      if (predict) renderPredictionData(predict);
    } else {
      showToast('Retraining failed: Insufficient samples', 'warning');
    }
  } catch (err) {
    showToast(`Retrain error: ${err.message}`, 'danger');
  }
}

// ── Helpers ────────────────────────────────────────────────
function setVal(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function formatHourLabel(h) {
  if (h == null) return '—';
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${ampm}`;
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch (_) {
    return String(ts);
  }
}

function updateLastSyncedTime() {
  const el = document.getElementById('footer-sync-time');
  if (el) el.textContent = new Date().toLocaleTimeString();
}

// ── Initialization ─────────────────────────────────────────
function initApp() {
  initTheme();
  initNavigation();

  // Attach button event listeners
  const btnSync = document.getElementById('manual-refresh-btn');
  if (btnSync) btnSync.addEventListener('click', () => {
    loadAllData();
    showToast('Telemetry re-synchronized', 'info', 1500);
  });

  const btnExport = document.getElementById('btn-export-csv');
  if (btnExport) btnExport.addEventListener('click', exportCSV);

  const btnBuzzer500 = document.getElementById('btn-test-buzzer-500');
  if (btnBuzzer500) btnBuzzer500.addEventListener('click', () => triggerBuzzer(500));

  const btnBuzzer1000 = document.getElementById('btn-test-buzzer-1000');
  if (btnBuzzer1000) btnBuzzer1000.addEventListener('click', () => triggerBuzzer(1000));

  const btnRetrain = document.getElementById('btn-retrain-ml');
  if (btnRetrain) btnRetrain.addEventListener('click', triggerModelRetrain);

  // Time filter pills on Analytics
  document.querySelectorAll('.time-pill').forEach(pill => {
    pill.addEventListener('click', async () => {
      document.querySelectorAll('.time-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const days = pill.getAttribute('data-days') || 30;
      const [hourly, daily, heatmap] = await Promise.all([
        fetchAPI(`/api/analytics/hourly?days=${days}`),
        fetchAPI(`/api/analytics/daily?days=${days}`),
        fetchAPI(`/api/analytics/heatmap?days=${days}`),
      ]);
      if (hourly) renderHourlyChart(hourly);
      if (daily) renderDailyChart(daily);
      if (heatmap) renderHeatmap(heatmap);
    });
  });

  // Load initial data
  loadAllData();

  // Connect WebSocket stream
  connectWebSocket();

  // Schedule periodic background polling (every 15s) and timer ticks (every 1s)
  state.refreshTimer = setInterval(loadAllData, 15000);
  state.tickTimer = setInterval(tickDurationTimers, 1000);
}

// Start application
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
