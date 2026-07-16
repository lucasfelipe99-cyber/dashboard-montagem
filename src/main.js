import "tabulator-tables/dist/css/tabulator.min.css";
import "vis-timeline/styles/vis-timeline-graph2d.min.css";
import { createIcons, icons } from "lucide";
import "./styles.css";
import { loadDataset } from "./services/sheetsService.js";
import { loadPlanningDataset } from "./services/planningService.js";
import { getDataConnectionSettings } from "./services/settingsService.js";
import { defaultFilters, Filters, applyFilters, todayFilters } from "./components/Filters.js";
import { Header } from "./components/Header.js";
import { Sidebar } from "./components/Sidebar.js";
import { loadingState, emptyState } from "./components/LoadingState.js";
import { destroyTables } from "./components/DataTable.js";
import { Overview, mountOverview } from "./pages/Overview.js";
import { TimelinePage, mountTimelinePage } from "./pages/TimelinePage.js";
import { Employees, mountEmployees } from "./pages/Employees.js";
import { Products, mountProducts } from "./pages/Products.js";
import { TimeAnalysis, mountTimeAnalysis } from "./pages/TimeAnalysis.js";
import { Planning, mountPlanning } from "./pages/Planning.js";
import { Database, mountDatabase } from "./pages/Database.js";
import { Settings, mountSettings } from "./pages/Settings.js";
import { addDaysISO, todayISO } from "./utils/dateUtils.js";
import { setTimelineWindow } from "./components/Timeline.js";

const app = document.getElementById("app");

const state = {
  page: "overview",
  dataset: null,
  planning: null,
  filteredRecords: [],
  filters: defaultFilters(),
  pendingFilters: defaultFilters(),
  lastUpdate: "",
  loading: true,
  error: "",
  sidebarCollapsed: false,
  presentation: false,
  timelineColor: "performance",
  rotationMs: 25000
};

function currentMount() {
  const records = state.filteredRecords;
  const mounts = {
    overview: () => mountOverview(records),
    timeline: () => mountTimelinePage(records, state),
    employees: () => mountEmployees(records),
    products: () => mountProducts(records),
    times: () => mountTimeAnalysis(records),
    planning: () => mountPlanning(records, state.planning, state.filters, refresh),
    settings: () => mountSettings(refreshAfterSettingsSave),
    database: () => mountDatabase(state.dataset)
  };
  mounts[state.page]?.();
}

function pageHtml() {
  if (state.loading) return loadingState();
  if (state.error && !state.dataset && state.page !== "settings") return `<div class="error-state">${state.error}</div>`;
  if (!state.filteredRecords.length && !["database", "settings", "planning"].includes(state.page)) return emptyState();
  const pages = {
    overview: () => Overview(state.filteredRecords),
    timeline: () => TimelinePage(state.filteredRecords, state),
    employees: () => Employees(state.filteredRecords),
    products: () => Products(state.filteredRecords),
    times: () => TimeAnalysis(state.filteredRecords),
    planning: () => Planning(state.filteredRecords, state.planning, state.filters),
    settings: () => Settings(state.dataset?.records || []),
    database: () => Database(state.dataset)
  };
  return pages[state.page]();
}

function render() {
  destroyTables();
  app.className = `${state.sidebarCollapsed ? "is-collapsed" : ""} ${state.presentation ? "presentation-mode" : ""}`;
  app.innerHTML = `
    ${Sidebar(state.page)}
    <main class="shell">
      ${Header(state)}
      <div class="content">
        ${state.error ? `<div class="warning-banner">${state.error}</div>` : ""}
        ${Filters(state)}
        ${pageHtml()}
      </div>
    </main>
  `;
  createIcons({ icons });
  bindEvents();
  requestAnimationFrame(currentMount);
}

function collectPendingFilters() {
  const next = todayFilters(state.pendingFilters);
  document.querySelectorAll("[data-filter]").forEach((el) => {
    const key = el.dataset.filter;
    next[key] = el.type === "checkbox" ? el.checked : el.value;
  });
  return todayFilters(next);
}

function applyQuickPeriod(filters) {
  const today = todayISO();
  const monthStart = `${today.slice(0, 8)}01`;
  if (filters.quick === "today") return { ...filters, startDate: today, endDate: today };
  if (filters.quick === "yesterday") return { ...filters, startDate: addDaysISO(today, -1), endDate: addDaysISO(today, -1) };
  if (filters.quick === "7d") return { ...filters, startDate: addDaysISO(today, -6), endDate: today };
  if (filters.quick === "month") return { ...filters, startDate: monthStart, endDate: today };
  return todayFilters(filters);
}

function setFilteredRecords() {
  state.filters = todayFilters(state.filters);
  state.filteredRecords = applyFilters(state.dataset?.records || [], state.filters);
}

function bindEvents() {
  document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => {
    state.page = button.dataset.page;
    render();
  }));
  document.querySelectorAll("[data-filter]").forEach((el) => el.addEventListener("change", () => {
    if (["startDate", "endDate"].includes(el.dataset.filter)) {
      const quick = document.querySelector("[data-filter='quick']");
      if (quick) quick.value = "custom";
    }
    state.pendingFilters = collectPendingFilters();
    if (el.dataset.filter === "quick") {
      state.filters = applyQuickPeriod(state.pendingFilters);
      setFilteredRecords();
      render();
    }
  }));
  document.querySelector("[data-action='apply-filters']")?.addEventListener("click", () => {
    state.filters = applyQuickPeriod(collectPendingFilters());
    state.pendingFilters = { ...state.filters };
    setFilteredRecords();
    render();
  });
  document.querySelector("[data-action='clear-filters']")?.addEventListener("click", () => {
    state.filters = defaultFilters();
    state.pendingFilters = { ...state.filters };
    setFilteredRecords();
    render();
  });
  document.querySelector("[data-action='refresh']")?.addEventListener("click", refresh);
  document.querySelector("[data-action='toggle-sidebar']")?.addEventListener("click", () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    render();
  });
  document.querySelector("[data-action='presentation']")?.addEventListener("click", () => {
    state.presentation = !state.presentation;
    if (state.presentation) document.documentElement.requestFullscreen?.();
    render();
  });
  document.querySelector("[data-action='timeline-15']")?.addEventListener("click", () => setTimelineWindow(15));
  document.querySelector("[data-action='timeline-30']")?.addEventListener("click", () => setTimelineWindow(30));
  document.querySelector("[data-action='timeline-60']")?.addEventListener("click", () => setTimelineWindow(60));
  document.querySelector("[data-action='timeline-now']")?.addEventListener("click", () => setTimelineWindow(90));
  document.querySelector("[data-action='timeline-full']")?.addEventListener("click", () => document.querySelector(".timeline-panel")?.requestFullscreen?.());
  document.querySelector("[data-action='timeline-export']")?.addEventListener("click", exportCsv);
  document.querySelector("[data-action='timeline-color']")?.addEventListener("change", (event) => {
    state.timelineColor = event.target.checked ? "performance" : "product";
    render();
  });
  document.querySelectorAll("[data-action='export-csv']").forEach((button) => {
    button.addEventListener("click", () => exportCsv(button.dataset.sourceType));
  });
}

function refreshAfterSettingsSave() {
  setupAutoRefresh();
  refresh();
}

window.addEventListener("chart-filter", (event) => {
  const { title, label } = event.detail;
  if (title === "employee") state.filters.employee = label;
  if (title === "product") state.filters.product = label;
  if (title === "shift") state.filters.shift = label;
  state.filters = todayFilters(state.filters);
  state.pendingFilters = { ...state.filters };
  setFilteredRecords();
  render();
});

function exportCsv(sourceType = "") {
  const databaseRows = state.dataset?.rawRows || [];
  const rows = state.page === "database"
    ? sourceType
      ? databaseRows.filter((row) => row.__sourceType === sourceType)
      : databaseRows
    : state.filteredRecords;
  const headers = Object.keys(rows[0] || {});
  const csv = [headers.join(";"), ...rows.map((row) => headers.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(";"))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dashboard-montagem-${state.page}${sourceType ? `-${sourceType}` : ""}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function refresh() {
  state.loading = true;
  state.error = "";
  render();
  try {
    state.dataset = await loadDataset();
    try {
      state.planning = await loadPlanningDataset();
    } catch (planningError) {
      state.planning = { plans: [], warning: planningError.message };
    }
    state.lastUpdate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date());
    state.error = [state.dataset.warning, state.planning?.warning].filter(Boolean).join(" | ");
    setFilteredRecords();
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    render();
  }
}

let rotation;
let refreshTimer;
function startPresentationRotation() {
  clearInterval(rotation);
  rotation = setInterval(() => {
    if (!state.presentation) return;
    const order = ["overview", "timeline", "employees", "products", "times"];
    state.page = order[(order.indexOf(state.page) + 1) % order.length];
    render();
  }, state.rotationMs);
}

function setupAutoRefresh() {
  clearInterval(refreshTimer);
  const refreshInterval = getDataConnectionSettings().refreshInterval;
  if (refreshInterval > 0) {
    refreshTimer = setInterval(refresh, refreshInterval);
  }
}

startPresentationRotation();
setupAutoRefresh();
refresh();
