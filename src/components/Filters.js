import { todayISO } from "../utils/dateUtils.js";
import { loadOperationalSettings } from "../services/settingsService.js";

export function todayFilters(filters = {}) {
  const today = todayISO();
  return {
    ...filters,
    startDate: filters.startDate || today,
    endDate: filters.endDate || today,
    quick: filters.quick || "today"
  };
}

export function defaultFilters() {
  const today = todayISO();
  return {
    startDate: today,
    endDate: today,
    source: "",
    shift: "",
    employee: "",
    machine: "",
    product: "",
    status: "",
    running: false,
    done: false,
    search: "",
    quick: "today"
  };
}

export function applyFilters(records, filters) {
  const scoped = todayFilters(filters);
  const term = (scoped.search || "").toLowerCase();
  return records.filter((record) => {
    if (scoped.startDate && record.date < scoped.startDate) return false;
    if (scoped.endDate && record.date > scoped.endDate) return false;
    if (scoped.source && record.sourceName !== scoped.source) return false;
    if (scoped.shift && record.shift !== scoped.shift) return false;
    if (scoped.employee && record.employee !== scoped.employee) return false;
    if (scoped.machine && String(record.machine || "") !== String(scoped.machine)) return false;
    if (scoped.product && record.product !== scoped.product) return false;
    if (scoped.status && record.status !== scoped.status) return false;
    if (scoped.running && !record.isRunning) return false;
    if (scoped.done && record.isRunning) return false;
    if (term && !`${record.sourceName} ${record.employee} ${record.machine || ""} ${record.product} ${record.shift} ${record.status}`.toLowerCase().includes(term)) return false;
    return true;
  });
}

function options(values, selected, placeholder) {
  return `<option value="">${placeholder}</option>${values.map((value) => `<option ${value === selected ? "selected" : ""}>${value}</option>`).join("")}`;
}

export function Filters(state) {
  const records = state.dataset?.records || [];
  const settings = loadOperationalSettings();
  const employees = [...new Set(records.map((item) => item.employee).filter(Boolean))].sort();
  const configuredMachines = Array.from({ length: settings.planningConnection?.cuttingMachines || 14 }, (_, index) => String(index + 1));
  const machines = [...new Set([...records.map((item) => String(item.machine || "")).filter(Boolean), ...configuredMachines])].sort((a, b) => Number(a) - Number(b));
  const products = [...new Set(records.map((item) => item.product).filter(Boolean))].sort();
  const sources = [...new Set(records.map((item) => item.sourceName).filter(Boolean))].sort();
  const shifts = [...new Set(records.map((item) => item.shift).filter(Boolean))].sort();
  const statuses = [...new Set(records.map((item) => item.status).filter(Boolean))].sort();
  const f = todayFilters(state.filters);
  return `
    <section class="filters">
      <label>Período<select data-filter="quick">
        <option value="today" ${f.quick === "today" ? "selected" : ""}>Hoje</option>
        <option value="yesterday" ${f.quick === "yesterday" ? "selected" : ""}>Ontem</option>
        <option value="7d" ${f.quick === "7d" ? "selected" : ""}>Últimos 7 dias</option>
        <option value="month" ${f.quick === "month" ? "selected" : ""}>Mês atual</option>
        <option value="custom" ${f.quick === "custom" ? "selected" : ""}>Personalizado</option>
      </select></label>
      <label>Data inicial<input type="date" value="${f.startDate}" data-filter="startDate"></label>
      <label>Data final<input type="date" value="${f.endDate}" data-filter="endDate"></label>
      <label>Base<select data-filter="source">${options(sources, f.source, "Todas")}</select></label>
      <label>Turno<select data-filter="shift">${options(shifts, f.shift, "Todos")}</select></label>
      <label>Funcionário<select data-filter="employee">${options(employees, f.employee, "Todos")}</select></label>
      <label>Maquina<select data-filter="machine">${options(machines, f.machine, "Todas")}</select></label>
      <label>Produto<select data-filter="product">${options(products, f.product, "Todos")}</select></label>
      <label>Status<select data-filter="status">${options(statuses, f.status, "Todos")}</select></label>
      <label class="checkbox"><input type="checkbox" ${f.running ? "checked" : ""} data-filter="running"> Em andamento</label>
      <label class="checkbox"><input type="checkbox" ${f.done ? "checked" : ""} data-filter="done"> Concluída</label>
      <label>Pesquisa<input type="search" value="${f.search}" data-filter="search" placeholder="Texto livre"></label>
      <div class="filter-actions">
        <button class="button primary" data-action="apply-filters"><i data-lucide="filter"></i> Aplicar filtros</button>
        <button class="button" data-action="clear-filters"><i data-lucide="eraser"></i> Limpar filtros</button>
      </div>
    </section>
  `;
}
