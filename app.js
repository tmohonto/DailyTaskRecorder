// Premium Scheduler with Daily, Monthly, Yearly tabs (9 AM‑5 PM, one task per hour per day)
// Data stored in Firebase (with localStorage fallback)

const TASK_STORAGE_KEY = "premium_task_scheduler_tasks";

// *** REPLACE THIS WITH YOUR OWN FIREBASE CONFIG ***
const firebaseConfig = {
  apiKey: "AIzaSyDtA5ZnbDkkPEr_3fyWh2OgSGbfJnUz47Q",
  authDomain: "taskscheduler-1a1d8.firebaseapp.com",
  databaseURL: "https://taskscheduler-1a1d8-default-rtdb.firebaseio.com",
  projectId: "taskscheduler-1a1d8",
  storageBucket: "taskscheduler-1a1d8.firebasestorage.app",
  messagingSenderId: "955512830230",
  appId: "1:955512830230:web:2cf8a1fa7a1e8bff5c3837",
  measurementId: "G-Z34ZB739E0"
};

let db = null;
try {
  if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
  }
} catch (e) {
  console.warn("Firebase not setup correctly yet. Waiting for keys.", e);
}

// ---------- Data handling ----------
let appTasks = [];

async function initData() {
  if (db) {
    try {
      const snapshot = await db.ref('scheduler_tasks').once('value');
      if (snapshot.exists()) {
        const data = snapshot.val();
        appTasks = Array.isArray(data) ? data : Object.values(data);
      } else {
        appTasks = [];
      }
    } catch (e) {
      console.error("Failed to load from Firebase. Using local DB.", e);
      fallbackLoad();
    }
  } else {
    fallbackLoad();
  }
}

function fallbackLoad() {
  const raw = localStorage.getItem(TASK_STORAGE_KEY);
  appTasks = raw ? JSON.parse(raw) : [];
}

function loadTasks() {
  return appTasks;
}

function saveTasks(tasks) {
  appTasks = tasks;
  localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks)); // Keep local backup
  if (db) {
    db.ref('scheduler_tasks').set(tasks).catch(e => {
      console.error("Firebase save failed", e);
    });
  }
}
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// ---------- Helpers ----------
function formatHour(hour) {
  const h = Number(hour);
  const suffix = h >= 12 ? "PM" : "AM";
  const display = h > 12 ? h - 12 : h;
  return `${display}\u00A0${suffix}`; // non‑breaking space
}
function todayKey() {
  return new Date().toDateString();
}
function renderDateHeader() {
  const header = document.getElementById("date-header");
  if (header) {
    const now = new Date();
    header.textContent = now.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }
}
function hideAllViews() {
  document.getElementById("daily-table").parentElement.style.display = "none";
  document.getElementById("monthly-view").style.display = "none";
  document.getElementById("yearly-view").style.display = "none";
}

// ---------- Global UI State ----------
window._selectedMonthDay = null; // day for monthly view
window._selectedYearMonth = null; // month for yearly view
window._selectedYearDay = null; // day for yearly view

// ---------- CRUD (upsert) ----------
function upsertTask(title, hour, dateOverride = null, workingHours = "") {
  const tasks = loadTasks();
  const targetDateObj = dateOverride ? dateOverride : new Date();
  const targetDateString = targetDateObj.toDateString();
  const now = new Date().toISOString();

  // Find existing task for that date & hour
  const existing = tasks.find(t => new Date(t.datetime).toDateString() === targetDateString && t.hour === Number(hour));
  if (existing) {
    existing.title = title;
    existing.workingHours = workingHours;
    existing.updated = now;
  } else {
    // Determine the datetime to save
    const dt = new Date(targetDateObj);
    dt.setHours(Number(hour), 0, 0, 0);
    tasks.push({
      id: generateId(),
      title,
      hour: Number(hour),
      workingHours,
      datetime: dt.toISOString(),
      updated: now,
    });
  }
  saveTasks(tasks);
}

function updateTotalDisplay() {
  let totalHours = 0;
  document.querySelectorAll('input[data-field="hours"]').forEach(inp => {
    const val = parseFloat(inp.value);
    if (!isNaN(val)) totalHours += val;
  });
  const totalCell = document.querySelector('.total-row td:last-child');
  if (totalCell) {
    totalCell.textContent = totalHours.toFixed(1);
  }
}

// ---------- Rendering ----------
function renderDaily() {
  hideAllViews();
  document.getElementById("daily-table").parentElement.style.display = "block";
  renderDateHeader();
  const tbody = document.querySelector("#daily-table tbody");
  if (!tbody) return;

  const tasks = loadTasks().filter(t => new Date(t.datetime).toDateString() === todayKey());
  const hourMap = {};
  for (let h = 9; h <= 17; h++) hourMap[h] = null;
  tasks.forEach(t => {
    hourMap[t.hour] = t;
  });

  let rows = "";
  let totalHours = 0;
  for (let h = 9; h <= 17; h++) {
    const task = hourMap[h];
    const title = task ? task.title : "";
    const wHours = task && task.workingHours ? task.workingHours : "";

    if (wHours) {
      const parsed = parseFloat(wHours);
      if (!isNaN(parsed)) totalHours += parsed;
    }

    rows += `<tr data-hour="${h}">
      <td>${formatHour(h)}</td>
      <td><input type="text" class="task-input" data-field="title" data-hour="${h}" value="${title}" placeholder="Enter task..." /></td>
      <td><input type="number" step="0.5" class="task-input" style="text-align:center;" data-field="hours" data-hour="${h}" value="${wHours}" placeholder="hrs" /></td>
    </tr>`;
  }

  rows += `<tr class="total-row" style="background: rgba(30, 41, 59, 0.8);">
    <td colspan="2" style="text-align: right; font-weight: bold; padding-right: 1.5rem; color: #cbd5e1; border-top-left-radius: 8px; border-bottom-left-radius: 8px;">Total Working Hours:</td>
    <td style="font-weight: bold; color: #f8fafc; font-size: 1rem; text-align:center; border-top-right-radius: 8px; border-bottom-right-radius: 8px;">${totalHours.toFixed(1)}</td>
  </tr>`;

  tbody.innerHTML = rows;

  // listeners for inline edit
  document.querySelectorAll('.task-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const hour = inp.dataset.hour;
      const tr = inp.closest('tr');
      const title = tr.querySelector('input[data-field="title"]').value;
      const wHours = tr.querySelector('input[data-field="hours"]').value;
      upsertTask(title, hour, null, wHours);
      updateTotalDisplay();
    });
  });
}

function renderMonthly() {
  hideAllViews();
  const container = document.getElementById("monthly-view");
  container.style.display = "block";

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0‑11
  const monthName = now.toLocaleString(undefined, { month: "long" });

  container.innerHTML = `<h2>${monthName} ${year}</h2>`;

  if (!window._selectedMonthDay) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let html = `<div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 1rem;">`;
    for (let d = 1; d <= daysInMonth; d++) {
      html += `<button class="month-btn day-btn" data-day="${d}" style="padding: 0.5rem; width: 3rem;">${d}</button>`;
    }
    html += `</div>`;
    container.innerHTML += html;

    document.querySelectorAll('.day-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        window._selectedMonthDay = Number(btn.dataset.day);
        renderMonthly();
      });
    });
    return;
  }

  const day = window._selectedMonthDay;
  const tasks = loadTasks().filter(t => {
    const d = new Date(t.datetime);
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
  });

  container.innerHTML += `
    <button id="back-to-month" style="margin-top:0.5rem; margin-bottom: 1rem; padding: 0.4rem 0.8rem; border-radius: 4px; border: none; background: rgba(255,255,255,0.1); color: #fff; cursor: pointer;">← Back to month</button>
    <h3 style="margin-bottom: 0.5rem;">Tasks for ${monthName} ${day}</h3>`;

  let html = `<table class="daily-table"><thead><tr><th>Hour</th><th>Task</th><th style="width: 100px;">Work Hours</th></tr></thead><tbody>`;

  const hourMap = {};
  let totalHours = 0;
  for (let h = 9; h <= 17; h++) hourMap[h] = null;
  tasks.forEach(t => { hourMap[t.hour] = t; });

  for (let h = 9; h <= 17; h++) {
    const task = hourMap[h];
    const title = task ? task.title : "";
    const wHours = task && task.workingHours ? task.workingHours : "";

    if (wHours) {
      const parsed = parseFloat(wHours);
      if (!isNaN(parsed)) totalHours += parsed;
    }

    html += `<tr data-hour="${h}">
      <td>${formatHour(h)}</td>
      <td><input type="text" class="task-input" data-field="title" data-hour="${h}" value="${title}" placeholder="Enter task..." /></td>
      <td><input type="number" step="0.5" class="task-input" style="text-align:center;" data-field="hours" data-hour="${h}" value="${wHours}" placeholder="hrs" /></td>
    </tr>`;
  }

  html += `<tr class="total-row" style="background: rgba(30, 41, 59, 0.8);">
    <td colspan="2" style="text-align: right; font-weight: bold; padding-right: 1.5rem; color: #cbd5e1; border-top-left-radius: 8px; border-bottom-left-radius: 8px;">Total Working Hours:</td>
    <td style="font-weight: bold; color: #f8fafc; font-size: 1rem; text-align:center; border-top-right-radius: 8px; border-bottom-right-radius: 8px;">${totalHours.toFixed(1)}</td>
  </tr>`;

  html += `</tbody></table>`;
  container.innerHTML += html;

  document.getElementById('back-to-month').addEventListener('click', () => {
    window._selectedMonthDay = null;
    renderMonthly();
  });

  document.querySelectorAll('.task-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const hour = inp.dataset.hour;
      const tr = inp.closest('tr');
      const title = tr.querySelector('input[data-field="title"]').value;
      const wHours = tr.querySelector('input[data-field="hours"]').value;
      upsertTask(title, hour, new Date(year, month, day), wHours);
      updateTotalDisplay();
    });
  });
}

function renderYearly() {
  hideAllViews();
  const container = document.getElementById("yearly-view");
  container.style.display = "block";
  const now = new Date();
  const year = now.getFullYear();

  if (window._selectedYearMonth === null || window._selectedYearMonth === undefined) {
    let html = `<h2>${year}</h2><div class="yearly-months" style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 1rem;">`;
    for (let m = 0; m < 12; m++) {
      const name = new Date(year, m).toLocaleString(undefined, { month: "short" });
      html += `<button class="month-btn" data-month="${m}" style="padding: 0.5rem; width: 4rem;">${name}</button>`;
    }
    html += `</div>`;
    container.innerHTML = html;
    document.querySelectorAll('.month-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        window._selectedYearMonth = Number(btn.dataset.month);
        renderYearly();
      });
    });
    return;
  }

  const month = window._selectedYearMonth;
  const monthDate = new Date(year, month);
  const monthName = monthDate.toLocaleString(undefined, { month: "long" });

  if (window._selectedYearDay === null || window._selectedYearDay === undefined) {
    let html = `<button id="back-to-year" style="margin-bottom:0.5rem; padding: 0.4rem 0.8rem; border-radius: 4px; border: none; background: rgba(255,255,255,0.1); color: #fff; cursor: pointer;">← Back to months</button>`;
    html += `<h2>${monthName} ${year}</h2>`;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    html += `<div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 1rem;">`;
    for (let d = 1; d <= daysInMonth; d++) {
      html += `<button class="month-btn day-btn" data-day="${d}" style="padding: 0.5rem; width: 3rem;">${d}</button>`;
    }
    html += `</div>`;
    container.innerHTML = html;

    document.getElementById('back-to-year').addEventListener('click', () => {
      window._selectedYearMonth = null;
      renderYearly();
    });

    document.querySelectorAll('.day-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        window._selectedYearDay = Number(btn.dataset.day);
        renderYearly();
      });
    });
    return;
  }

  const day = window._selectedYearDay;
  const tasks = loadTasks().filter(t => {
    const d = new Date(t.datetime);
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
  });

  let html = `<button id="back-to-month" style="margin-bottom:0.5rem; padding: 0.4rem 0.8rem; border-radius: 4px; border: none; background: rgba(255,255,255,0.1); color: #fff; cursor: pointer;">← Back to month</button>`;
  html += `<h3 style="margin-top: 1rem; margin-bottom: 0.5rem;">Tasks for ${monthName} ${day}, ${year}</h3>`;

  html += `<table class="daily-table"><thead><tr><th>Hour</th><th>Task</th><th style="width: 100px;">Work Hours</th></tr></thead><tbody>`;

  const hourMap = {};
  let totalHours = 0;
  for (let h = 9; h <= 17; h++) hourMap[h] = null;
  tasks.forEach(t => { hourMap[t.hour] = t; });

  for (let h = 9; h <= 17; h++) {
    const task = hourMap[h];
    const title = task ? task.title : "";
    const wHours = task && task.workingHours ? task.workingHours : "";

    if (wHours) {
      const parsed = parseFloat(wHours);
      if (!isNaN(parsed)) totalHours += parsed;
    }

    html += `<tr data-hour="${h}">
      <td>${formatHour(h)}</td>
      <td><input type="text" class="task-input" data-field="title" data-hour="${h}" value="${title}" placeholder="Enter task..." /></td>
      <td><input type="number" step="0.5" class="task-input" style="text-align:center;" data-field="hours" data-hour="${h}" value="${wHours}" placeholder="hrs" /></td>
    </tr>`;
  }

  html += `<tr class="total-row" style="background: rgba(30, 41, 59, 0.8);">
    <td colspan="2" style="text-align: right; font-weight: bold; padding-right: 1.5rem; color: #cbd5e1; border-top-left-radius: 8px; border-bottom-left-radius: 8px;">Total Working Hours:</td>
    <td style="font-weight: bold; color: #f8fafc; font-size: 1rem; text-align:center; border-top-right-radius: 8px; border-bottom-right-radius: 8px;">${totalHours.toFixed(1)}</td>
  </tr>`;

  html += `</tbody></table>`;
  container.innerHTML = html;

  document.getElementById('back-to-month').addEventListener('click', () => {
    window._selectedYearDay = null;
    renderYearly();
  });

  document.querySelectorAll('.task-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const hour = inp.dataset.hour;
      const tr = inp.closest('tr');
      const title = tr.querySelector('input[data-field="title"]').value;
      const wHours = tr.querySelector('input[data-field="hours"]').value;
      upsertTask(title, hour, new Date(year, month, day), wHours);
      updateTotalDisplay();
    });
  });
}

// ---------- View Switcher ----------
function setupViewSwitcher() {
  const buttons = document.querySelectorAll('.view-switcher button');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelector('.view-switcher button.active').classList.remove('active');
      btn.classList.add('active');
      const view = btn.dataset.view;

      // Reset navigation state when switching tabs
      window._selectedMonthDay = null;
      window._selectedYearMonth = null;
      window._selectedYearDay = null;

      if (view === 'daily') renderDaily();
      else if (view === 'monthly') renderMonthly();
      else if (view === 'yearly') renderYearly();
    });
  });
}

// ---------- Export Setup ----------
function setupExport() {
  const btn = document.getElementById('export-excel-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      const tasks = loadTasks();
      if (tasks.length === 0) {
        alert("No data to export!");
        return;
      }
      let csv = "Date,Hour,Task,Working Hours\n";
      // Sort chronologically
      const sorted = [...tasks].sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

      sorted.forEach(t => {
        const d = new Date(t.datetime).toLocaleDateString();
        const hr = formatHour(t.hour);
        const title = (t.title || "").replace(/"/g, '""'); // escape quotes
        const wh = t.workingHours || "";
        csv += `"${d}","${hr}","${title}","${wh}"\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "Scheduler_Export.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }
}

// ---------- Init ----------
async function renderCurrentView() {
  await initData();
  // default to daily on load
  renderDaily();
}

document.addEventListener('DOMContentLoaded', () => {
  setupViewSwitcher();
  setupExport();
  renderCurrentView();
});
