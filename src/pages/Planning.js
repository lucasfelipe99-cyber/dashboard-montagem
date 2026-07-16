import { tableShell, renderTable } from "../components/DataTable.js";
import { loadOperationalSettings } from "../services/settingsService.js";
import { savePlanRecord } from "../services/planningService.js";
import { addDaysISO, parseTime, secondsToDuration, todayISO } from "../utils/dateUtils.js";
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

function shiftMatchesSchedule(schedule, selectedShift) {
  if (!selectedShift) return true;
  const raw = normalize(`${schedule.shift} ${schedule.start} ${schedule.end}`);
  if (selectedShift === "1") return raw.includes("1") || schedule.start === "05:00";
  if (selectedShift === "2") return raw.includes("2") || schedule.start === "14:00";
  if (selectedShift === "3") return raw.includes("3") || schedule.start === "21:00";
  return true;
}

function capacityDetails(type, dates, filters = {}) {
  const settings = loadOperationalSettings();
  if (type === "corte") {
    const machines = settings.planningConnection.cuttingMachines || 14;
    const daySeconds = machines * 24 * 3600;
    return {
      seconds: daySeconds * dates.length,
      formula: `${machines} maquinas x 24h x ${dates.length} dia(s)`,
      perDay: daySeconds,
      resources: machines
    };
  }
  const schedules = settings.employeeSchedules
    .filter((schedule) => normalize(schedule.workType) === "MONTAGEM")
    .filter((schedule) => shiftMatchesSchedule(schedule, filters.shift));
  const standardWorkdaySeconds = 8 * 3600;
  const montageSeconds = schedules.length * standardWorkdaySeconds;
  return {
    seconds: montageSeconds * dates.length,
    formula: `${schedules.length} montador(es) x 8h x ${dates.length} dia(s)`,
    perDay: montageSeconds,
    resources: schedules.length
  };
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

function comparisonRows(records, plans, dates, filters = {}) {
  return ["montagem", "corte"].map((type) => {
    const planned = aggregatePlan(plans, type);
    const actual = aggregateActual(records, type);
    const capacity = capacityDetails(type, dates, filters);
    return {
      tipo: typeLabels[type],
      plannedQuantity: planned.quantity,
      actualQuantity: actual.quantity,
      quantityVariance: actual.quantity - planned.quantity,
      plannedSeconds: planned.seconds,
      actualSeconds: actual.seconds,
      capacitySeconds: capacity.seconds,
      capacityFormula: capacity.formula,
      capacityPerDay: capacity.perDay,
      capacityResources: capacity.resources,
      capacityUse: safeDivide(planned.seconds, capacity.seconds) * 100,
      actualCapacityUse: safeDivide(actual.seconds, capacity.seconds) * 100,
      timeVariance: actual.seconds - planned.seconds
    };
  });
}

function dailyRows(records, plans, dates, filters = {}) {
  return dates.flatMap((date) => ["montagem", "corte"].map((type) => {
    const dayPlans = plans.filter((plan) => plan.date === date && plan.type === type);
    const dayActual = productionRecords(records).filter((record) => record.date === date && record.sourceType === type);
    const capacity = capacityDetails(type, [date], filters);
    const plannedSeconds = dayPlans.reduce((sum, plan) => sum + plan.theoreticalTotalSeconds, 0);
    const actualSeconds = dayActual.reduce((sum, record) => sum + record.realSeconds, 0);
    return {
      date,
      tipo: typeLabels[type],
      plannedQuantity: dayPlans.reduce((sum, plan) => sum + plan.quantity, 0),
      actualQuantity: dayActual.reduce((sum, record) => sum + record.quantity, 0),
      plannedSeconds,
      actualSeconds,
      capacitySeconds: capacity.seconds,
      capacityUse: safeDivide(plannedSeconds, capacity.seconds) * 100,
      actualCapacityUse: safeDivide(actualSeconds, capacity.seconds) * 100
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
        <article class="kpi-card capacity-card">
          <span>${row.tipo} disponivel</span>
          <strong>${secondsToDuration(row.capacitySeconds)}</strong>
          <small>${secondsToDuration(row.capacityPerDay)} por dia</small>
          <em>${row.capacityFormula}</em>
        </article>
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

function theoreticalUnits(records) {
  const settings = loadOperationalSettings();
  const map = new Map();
  productionRecords(records).forEach((record) => {
    if (!record.theoreticalUnitSeconds) return;
    const scopedKey = `${record.sourceType}|${normalize(record.product)}`;
    if (!map.has(scopedKey)) map.set(scopedKey, record.theoreticalUnitSeconds);
    const genericKey = `all|${normalize(record.product)}`;
    if (!map.has(genericKey)) map.set(genericKey, record.theoreticalUnitSeconds);
  });
  settings.theoreticalTimes.forEach((item) => {
    const seconds = parseTime(item.theoreticalUnitTime);
    if (seconds) map.set(`all|${normalize(item.product)}`, seconds);
  });
  return Object.fromEntries(map.entries());
}

function capacityChart(rows) {
  return `
    <article class="panel chart-panel planning-capacity-panel">
      <h2>Consumo de capacidade</h2>
      <p>Plano e Realizado aparecem como consumo sobre a capacidade disponivel do periodo filtrado.</p>
      <div class="native-chart-legend">
        <span><i style="background:#d9e2ec"></i> Capacidade</span>
        <span><i style="background:#f59e0b"></i> Plano</span>
        <span><i style="background:#0f5f8f"></i> Realizado</span>
      </div>
      <div class="planning-capacity-chart">
        ${rows.map((row) => capacityChartGroup(row)).join("")}
      </div>
    </article>
  `;
}

function capacityMetricLane(label, value, capacity, color, detail, isCapacity = false) {
  const percent = isCapacity ? 100 : safeDivide(value, capacity) * 100;
  const capped = Math.min(Math.max(percent, value ? 1 : 0), 100);
  return `
    <div class="capacity-lane">
      <span class="capacity-lane-label">${label}</span>
      <span class="capacity-lane-track">
        <span class="capacity-lane-fill" style="--bar:${capped}%;--color:${color}"></span>
      </span>
      <span class="capacity-lane-value">
        <strong>${secondsToDuration(value)}</strong>
        <small>${detail}</small>
      </span>
    </div>
  `;
}

function capacityChartGroup(row) {
  return `
    <section class="capacity-group">
      <div class="capacity-group-header">
        <strong>${row.tipo}</strong>
        <span>${row.capacityFormula}</span>
      </div>
      ${capacityMetricLane("Capacidade", row.capacitySeconds, row.capacitySeconds, "#d9e2ec", "100% disponivel", true)}
      ${capacityMetricLane("Plano", row.plannedSeconds, row.capacitySeconds, "#f59e0b", `${formatPercent(row.capacityUse)} da capacidade`)}
      ${capacityMetricLane("Realizado", row.actualSeconds, row.capacitySeconds, "#0f5f8f", `${formatPercent(row.actualCapacityUse)} da capacidade`)}
    </section>
  `;
}

function planningItemRow() {
  return `
    <tr class="planning-item-row">
      <td>
        <input name="item" list="planning-items" placeholder="Produto ou tipo de corte" required>
        <small data-theoretical-note>Informe o item e a quantidade.</small>
      </td>
      <td><input type="number" min="0" step="1" name="quantity" required></td>
      <td><input name="theoreticalTotal" placeholder="Automatico" readonly required></td>
      <td><input name="observation" placeholder="Opcional"></td>
      <td><button class="button" type="button" data-action="remove-plan-row">Remover</button></td>
    </tr>
  `;
}

function planForm(records, plans, filters) {
  const products = unique([
    ...productionRecords(records).map((record) => record.product),
    ...plans.map((plan) => plan.item)
  ]);
  const unitsPayload = encodeURIComponent(JSON.stringify(theoreticalUnits(records)));
  return `
    <article class="panel planning-form-panel">
      <div class="section-title">
        <div>
          <h2>Lancar plano geral</h2>
          <p>Informe o volume planejado do dia. O lancamento sera enviado para a planilha de planejamento.</p>
        </div>
      </div>
      <datalist id="planning-items">${products.map((item) => `<option value="${item}"></option>`).join("")}</datalist>
      <form id="planning-form" class="planning-form" data-theoretical-units="${unitsPayload}">
        <div class="planning-form-head">
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
          <div class="filter-actions">
            <button class="button" type="button" data-action="add-plan-row">+ Linha</button>
          </div>
        </div>
        <div class="responsive-table">
          <table class="planning-entry-table">
            <thead>
              <tr>
                <th>Produto / Palco-Tipo</th>
                <th>Qtd planejada</th>
                <th>Tempo teorico total</th>
                <th>Observacao</th>
                <th></th>
              </tr>
            </thead>
            <tbody data-plan-rows>
              ${planningItemRow()}
            </tbody>
          </table>
        </div>
        <div class="planning-form-footer">
          <span class="planning-unit-note" data-planning-total>1 linha pronta para lancamento.</span>
          <button class="button primary" type="submit"><i data-lucide="save"></i> Salvar lancamentos no Sheets</button>
        </div>
      </form>
    </article>
  `;
}

export function Planning(records, planning, filters) {
  const plans = (planning?.plans || []).filter((plan) => planMatchesFilters(plan, filters));
  const dates = dateRange(filters, records, plans);
  const rows = comparisonRows(records, plans, dates, filters);
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
  renderTable("planning-comparison-table", comparisonRows(records, plans, dates, filters), [
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

  renderTable("planning-daily-table", dailyRows(records, plans, dates, filters), [
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

  const formEl = document.querySelector("#planning-form");
  const refreshPlanningTotals = () => {
    const rows = [...document.querySelectorAll(".planning-item-row")];
    const validRows = rows.filter((row) => row.querySelector("[name='item']").value && row.querySelector("[name='quantity']").value);
    const totalSeconds = rows.reduce((sum, row) => sum + (parseTime(row.querySelector("[name='theoreticalTotal']").value) || 0), 0);
    const summary = document.querySelector("[data-planning-total]");
    if (summary) {
      summary.textContent = `${validRows.length} linha(s) preenchida(s) | Tempo total planejado: ${secondsToDuration(totalSeconds)}`;
    }
  };
  const refreshTheoreticalTotal = (row) => {
    if (!formEl || !row) return;
    const units = JSON.parse(decodeURIComponent(formEl.dataset.theoreticalUnits || "%7B%7D"));
    const type = formEl.elements.type.value;
    const itemInput = row.querySelector("[name='item']");
    const quantityInput = row.querySelector("[name='quantity']");
    const totalInput = row.querySelector("[name='theoreticalTotal']");
    const item = normalize(itemInput?.value);
    const quantity = Number(quantityInput?.value || 0);
    const unit = units[`${type}|${item}`] || units[`all|${item}`] || 0;
    const total = unit * quantity;
    totalInput.value = total ? secondsToDuration(total) : "";
    const note = row.querySelector("[data-theoretical-note]");
    if (note) {
      note.textContent = unit
        ? `Tempo unitario encontrado: ${secondsToDuration(unit)} x ${number(quantity)} un. = ${secondsToDuration(total)}`
        : "Tempo teorico unitario nao encontrado para este produto/tipo. Cadastre o tempo na base real ou em Configuracoes.";
    }
    refreshPlanningTotals();
  };
  const refreshAllRows = () => {
    document.querySelectorAll(".planning-item-row").forEach(refreshTheoreticalTotal);
  };
  formEl?.elements.type.addEventListener("change", refreshAllRows);
  formEl?.querySelector("[data-plan-rows]")?.addEventListener("input", (event) => {
    const row = event.target.closest(".planning-item-row");
    if (row && ["item", "quantity"].includes(event.target.name)) refreshTheoreticalTotal(row);
  });
  formEl?.querySelector("[data-plan-rows]")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action='remove-plan-row']");
    if (!button) return;
    const rows = [...formEl.querySelectorAll(".planning-item-row")];
    if (rows.length === 1) {
      rows[0].querySelectorAll("input").forEach((input) => { input.value = ""; });
      refreshTheoreticalTotal(rows[0]);
      return;
    }
    button.closest(".planning-item-row")?.remove();
    refreshPlanningTotals();
  });
  formEl?.querySelector("[data-action='add-plan-row']")?.addEventListener("click", () => {
    formEl.querySelector("[data-plan-rows]")?.insertAdjacentHTML("beforeend", planningItemRow());
    refreshPlanningTotals();
  });
  refreshAllRows();

  formEl?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const rowsToSave = [...event.currentTarget.querySelectorAll(".planning-item-row")]
      .map((row) => ({
        item: normalize(row.querySelector("[name='item']").value),
        quantity: Number(row.querySelector("[name='quantity']").value || 0),
        theoreticalTotalSeconds: parseTime(row.querySelector("[name='theoreticalTotal']").value),
        observation: row.querySelector("[name='observation']").value
      }))
      .filter((row) => row.item || row.quantity || row.theoreticalTotalSeconds);
    if (!rowsToSave.length) {
      alert("Inclua pelo menos uma linha de plano.");
      return;
    }
    if (rowsToSave.some((row) => !row.item || !row.quantity || !row.theoreticalTotalSeconds)) {
      alert("Preencha produto/tipo e quantidade em todas as linhas. O tempo teorico precisa ser calculado automaticamente.");
      return;
    }
    try {
      for (const row of rowsToSave) {
        await savePlanRecord({
          type: form.get("type"),
          date: form.get("date"),
          shift: form.get("shift"),
          item: row.item,
          quantity: row.quantity,
          theoreticalTotalSeconds: row.theoreticalTotalSeconds,
          observation: row.observation
        });
      }
      alert(`${rowsToSave.length} lancamento(s) enviado(s) para o Google Sheets. A tela sera atualizada.`);
      onSave?.();
    } catch (error) {
      alert(error.message);
    }
  });
}
