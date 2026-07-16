import { tableShell, renderTable } from "../components/DataTable.js";
import { loadOperationalSettings } from "../services/settingsService.js";
import { savePlanRecord } from "../services/planningService.js";
import { addDaysISO, calculateDuration, parseTime, secondsToDuration, todayISO } from "../utils/dateUtils.js";
import { safeDivide } from "../utils/calculations.js";

const typeLabels = {
  montagem: "Montagem",
  corte: "Corte"
};

const SHIFT_OPTIONS = ["1", "2", "3"];
const clean = (value) => String(value ?? "").trim();
const normalize = (value) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const productionRecords = (records) => records.filter((record) => !record.isIdle && !record.isBreak && !record.invalid);

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function planMatchesFilters(plan, filters) {
  const term = normalize(filters.search || "");
  if (filters.startDate && plan.date < filters.startDate) return false;
  if (filters.endDate && plan.date > filters.endDate) return false;
  if (filters.source === "Montagem" && plan.type !== "montagem") return false;
  if (filters.source === "Corte" && plan.type !== "corte") return false;
  if (filters.shift && plan.shift !== filters.shift) return false;
  if (filters.product && plan.item !== filters.product) return false;
  if (term && !normalize(`${plan.sourceName} ${plan.date} ${plan.shift} ${plan.item} ${plan.observation}`).includes(term)) return false;
  return true;
}

function dateRange(filters, records, plans) {
  const start = filters.startDate || records[0]?.date || plans[0]?.date || todayISO();
  const end = filters.endDate || start;
  const dates = [];
  let cursor = start;
  while (cursor <= end && dates.length < 370) {
    dates.push(cursor);
    cursor = addDaysISO(cursor, 1);
  }
  return dates;
}

function scheduleDuration(schedule) {
  return calculateDuration(parseTime(schedule.start), parseTime(schedule.end));
}

function capacityByType(type, dates) {
  const settings = loadOperationalSettings();
  if (type === "corte") return (settings.planningConnection.cuttingMachines || 14) * 24 * 3600 * dates.length;
  const montageSeconds = settings.employeeSchedules
    .filter((schedule) => normalize(schedule.workType) === "MONTAGEM")
    .reduce((sum, schedule) => sum + scheduleDuration(schedule), 0);
  return montageSeconds * dates.length;
}

function aggregatePlan(plans, type) {
  const scoped = plans.filter((plan) => plan.type === type);
  return {
    quantity: scoped.reduce((sum, plan) => sum + plan.quantity, 0),
    seconds: scoped.reduce((sum, plan) => sum + plan.theoreticalTotalSeconds, 0),
    count: scoped.length
  };
}

function aggregateActual(records, type) {
  const scoped = productionRecords(records).filter((record) => record.sourceType === type);
  return {
    quantity: scoped.reduce((sum, record) => sum + record.quantity, 0),
    seconds: scoped.reduce((sum, record) => sum + record.realSeconds, 0),
    count: scoped.length
  };
}

function comparisonRows(records, plans, dates) {
  return ["montagem", "corte"].map((type) => {
    const planned = aggregatePlan(plans, type);
    const actual = aggregateActual(records, type);
    const capacity = capacityByType(type, dates);
    return {
      tipo: typeLabels[type],
      plannedQuantity: planned.quantity,
      actualQuantity: actual.quantity,
      quantityVariance: actual.quantity - planned.quantity,
      plannedSeconds: planned.seconds,
      actualSeconds: actual.seconds,
      capacitySeconds: capacity,
      capacityUse: safeDivide(planned.seconds, capacity) * 100,
      actualCapacityUse: safeDivide(actual.seconds, capacity) * 100,
      timeVariance: actual.seconds - planned.seconds
    };
  });
}

function dailyRows(records, plans, dates) {
  return dates.flatMap((date) => ["montagem", "corte"].map((type) => {
    const dayPlans = plans.filter((plan) => plan.date === date && plan.type === type);
    const dayActual = productionRecords(records).filter((record) => record.date === date && record.sourceType === type);
    const capacity = capacityByType(type, [date]);
    const plannedSeconds = dayPlans.reduce((sum, plan) => sum + plan.theoreticalTotalSeconds, 0);
    const actualSeconds = dayActual.reduce((sum, record) => sum + record.realSeconds, 0);
    return {
      date,
      tipo: typeLabels[type],
      plannedQuantity: dayPlans.reduce((sum, plan) => sum + plan.quantity, 0),
      actualQuantity: dayActual.reduce((sum, record) => sum + record.quantity, 0),
      plannedSeconds,
      actualSeconds,
      capacitySeconds: capacity,
      capacityUse: safeDivide(plannedSeconds, capacity) * 100,
      actualCapacityUse: safeDivide(actualSeconds, capacity) * 100
    };
  }));
}

function formatPercent(value) {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function number(value) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function capacityCards(rows) {
  return `
    <section class="kpi-grid planning-kpis">
      ${rows.map((row) => `
        <article class="kpi-card">
          <span>${row.tipo} planejado</span>
          <strong>${secondsToDuration(row.plannedSeconds)}</strong>
          <small>${number(row.plannedQuantity)} un. | ${formatPercent(row.capacityUse)} da capacidade</small>
        </article>
        <article class="kpi-card">
          <span>${row.tipo} realizado</span>
          <strong>${secondsToDuration(row.actualSeconds)}</strong>
          <small>${number(row.actualQuantity)} un. | ${formatPercent(row.actualCapacityUse)} da capacidade</small>
        </article>
      `).join("")}
    </section>
  `;
}

function capacityChart(rows) {
  const max = Math.max(...rows.flatMap((row) => [row.capacitySeconds, row.plannedSeconds, row.actualSeconds]), 1);
  return `
    <article class="panel chart-panel">
      <h2>Consumo de capacidade</h2>
      <div class="native-chart-legend">
        <span><i style="background:#f59e0b"></i> Planejado</span>
        <span><i style="background:#0f5f8f"></i> Realizado</span>
        <span><i style="background:#d9e2ec"></i> Capacidade</span>
      </div>
      <div class="native-bars">
        ${rows.map((row) => `
          <div class="native-bar-row planning-bar-row">
            <span class="native-bar-label">${row.tipo}</span>
            <span class="native-bar-track">
              <span class="native-bar" style="--bar:${Math.max(row.capacitySeconds / max * 100, 1)}%;--color:#d9e2ec"></span>
              <span class="native-bar" style="--bar:${Math.max(row.plannedSeconds / max * 100, 1)}%;--color:#f59e0b"></span>
              <span class="native-bar" style="--bar:${Math.max(row.actualSeconds / max * 100, 1)}%;--color:#0f5f8f"></span>
            </span>
            <span class="native-bar-values">
              <b>Plano ${secondsToDuration(row.plannedSeconds)}</b>
              <b>Real ${secondsToDuration(row.actualSeconds)}</b>
              <b>Cap. ${secondsToDuration(row.capacitySeconds)}</b>
            </span>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function planForm(records, plans, filters) {
  const products = unique([
    ...productionRecords(records).map((record) => record.product),
    ...plans.map((plan) => plan.item)
  ]);
  return `
    <article class="panel planning-form-panel">
      <div class="section-title">
        <div>
          <h2>Lancar plano geral</h2>
          <p>Informe o volume planejado do dia. O lancamento sera enviado para a planilha de planejamento.</p>
        </div>
      </div>
      <datalist id="planning-items">${products.map((item) => `<option value="${item}"></option>`).join("")}</datalist>
      <form id="planning-form" class="planning-form">
        <label>Base
          <select name="type">
            <option value="montagem">Montagem</option>
            <option value="corte">Corte</option>
          </select>
        </label>
        <label>Data
          <input type="date" name="date" value="${filters.startDate || todayISO()}" required>
        </label>
        <label>Turno
          <select name="shift" required>
            ${SHIFT_OPTIONS.map((shift) => `<option value="${shift}">${shift} turno</option>`).join("")}
          </select>
        </label>
        <label>Produto / Tipo
          <input name="item" list="planning-items" placeholder="Produto ou tipo de corte" required>
        </label>
        <label>Qtd planejada
          <input type="number" min="0" step="1" name="quantity" required>
        </label>
        <label>Tempo teorico total
          <input name="theoreticalTotal" placeholder="08:30:00" required>
        </label>
        <label class="wide-field">Observacao
          <input name="observation" placeholder="Opcional">
        </label>
        <div class="filter-actions">
          <button class="button primary" type="submit"><i data-lucide="save"></i> Salvar no Sheets</button>
        </div>
      </form>
    </article>
  `;
}

export function Planning(records, planning, filters) {
  const plans = (planning?.plans || []).filter((plan) => planMatchesFilters(plan, filters));
  const dates = dateRange(filters, records, plans);
  const rows = comparisonRows(records, plans, dates);
  return `
    <section class="page-heading">
      <h1>Planejamento</h1>
      <p>Lance o plano geral de montagem e corte, acompanhe o realizado e veja o consumo de capacidade.</p>
    </section>
    ${planning?.warning ? `<div class="warning-banner">${planning.warning}</div>` : ""}
    ${planForm(records, plans, filters)}
    ${capacityCards(rows)}
    ${capacityChart(rows)}
    <section class="panel">
      <div class="section-title"><h2>Planejado x realizado</h2><span>Periodo filtrado</span></div>
      ${tableShell("planning-comparison-table")}
    </section>
    <section class="panel">
      <div class="section-title"><h2>Plano lancado</h2><span>${plans.length} registro(s)</span></div>
      ${tableShell("planning-table")}
    </section>
    <section class="panel">
      <div class="section-title"><h2>Comparacao por dia</h2><span>${dates.length} dia(s)</span></div>
      ${tableShell("planning-daily-table")}
    </section>
  `;
}

export function mountPlanning(records, planning, filters, onSave) {
  const plans = (planning?.plans || []).filter((plan) => planMatchesFilters(plan, filters));
  const dates = dateRange(filters, records, plans);
  renderTable("planning-comparison-table", comparisonRows(records, plans, dates), [
    { title: "Base", field: "tipo" },
    { title: "Qtd planejada", field: "plannedQuantity", formatter: (cell) => number(cell.getValue()), hozAlign: "right" },
    { title: "Qtd realizada", field: "actualQuantity", formatter: (cell) => number(cell.getValue()), hozAlign: "right" },
    { title: "Dif. qtd", field: "quantityVariance", formatter: (cell) => number(cell.getValue()), hozAlign: "right" },
    { title: "Horas planejadas", field: "plannedSeconds", formatter: (cell) => secondsToDuration(cell.getValue()) },
    { title: "Horas realizadas", field: "actualSeconds", formatter: (cell) => secondsToDuration(cell.getValue()) },
    { title: "Capacidade", field: "capacitySeconds", formatter: (cell) => secondsToDuration(cell.getValue()) },
    { title: "% plano/cap.", field: "capacityUse", formatter: (cell) => formatPercent(cell.getValue()) },
    { title: "% real/cap.", field: "actualCapacityUse", formatter: (cell) => formatPercent(cell.getValue()) },
    { title: "Dif. horas", field: "timeVariance", formatter: (cell) => secondsToDuration(cell.getValue()) }
  ], { height: "240px" });

  renderTable("planning-table", plans, [
    { title: "Data", field: "date", headerFilter: true },
    { title: "Base", field: "sourceName", headerFilter: true },
    { title: "Turno", field: "shift", headerFilter: true },
    { title: "Produto / Tipo", field: "item", headerFilter: true },
    { title: "Qtd planejada", field: "quantity", formatter: (cell) => number(cell.getValue()), hozAlign: "right" },
    { title: "Tempo teorico", field: "theoreticalTotalSeconds", formatter: (cell) => secondsToDuration(cell.getValue()) },
    { title: "Observacao", field: "observation" }
  ], { height: "340px" });

  renderTable("planning-daily-table", dailyRows(records, plans, dates), [
    { title: "Data", field: "date", headerFilter: true },
    { title: "Base", field: "tipo", headerFilter: true },
    { title: "Qtd planejada", field: "plannedQuantity", formatter: (cell) => number(cell.getValue()), hozAlign: "right" },
    { title: "Qtd realizada", field: "actualQuantity", formatter: (cell) => number(cell.getValue()), hozAlign: "right" },
    { title: "Horas planejadas", field: "plannedSeconds", formatter: (cell) => secondsToDuration(cell.getValue()) },
    { title: "Horas realizadas", field: "actualSeconds", formatter: (cell) => secondsToDuration(cell.getValue()) },
    { title: "Capacidade", field: "capacitySeconds", formatter: (cell) => secondsToDuration(cell.getValue()) },
    { title: "% plano/cap.", field: "capacityUse", formatter: (cell) => formatPercent(cell.getValue()) },
    { title: "% real/cap.", field: "actualCapacityUse", formatter: (cell) => formatPercent(cell.getValue()) }
  ], { height: "340px" });

  document.querySelector("#planning-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const theoreticalTotalSeconds = parseTime(form.get("theoreticalTotal"));
    if (!theoreticalTotalSeconds) {
      alert("Informe o tempo teorico total no formato 08:30:00.");
      return;
    }
    try {
      await savePlanRecord({
        type: form.get("type"),
        date: form.get("date"),
        shift: form.get("shift"),
        item: normalize(form.get("item")),
        quantity: Number(form.get("quantity") || 0),
        theoreticalTotalSeconds,
        observation: form.get("observation")
      });
      alert("Plano enviado para o Google Sheets. A tela sera atualizada.");
      onSave?.();
    } catch (error) {
      alert(error.message);
    }
  });
}
