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
const normalizeShiftValue = (value) => normalize(value).match(/[123]/)?.[0] || clean(value);
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
  if (filters.shift && normalizeShiftValue(plan.shift) !== normalizeShiftValue(filters.shift)) return false;
  if (filters.product && normalize(plan.item) !== normalize(filters.product)) return false;
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
  const baseRows = ["montagem", "corte"].map((type) => {
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
      actualShare: 0,
      timeVariance: actual.seconds - planned.seconds
    };
  });
  const totalActualSeconds = baseRows.reduce((sum, row) => sum + row.actualSeconds, 0);
  return baseRows.map((row) => ({
    ...row,
    actualShare: safeDivide(row.actualSeconds, totalActualSeconds) * 100
  }));
}

function itemComparisonRows(records, plans) {
  const production = productionRecords(records);
  const map = new Map();
  const ensure = (type, item, date = "", shift = "") => {
    const key = `${type}|${normalize(item)}|${date}|${shift}`;
    if (!map.has(key)) {
      map.set(key, {
        date,
        shift,
        tipo: typeLabels[type],
        type,
        item: normalize(item),
        plannedQuantity: 0,
        actualQuantity: 0,
        quantityVariance: 0,
        plannedSeconds: 0,
        actualSeconds: 0,
        timeVariance: 0,
        fulfillment: 0,
        situation: "Planejado"
      });
    }
    return map.get(key);
  };

  plans.forEach((plan) => {
    const row = ensure(plan.type, plan.item, plan.date, plan.shift);
    row.plannedQuantity += plan.quantity;
    row.plannedSeconds += plan.theoreticalTotalSeconds;
  });

  production.forEach((record) => {
    const matchingPlan = plans.find((plan) =>
      plan.type === record.sourceType &&
      plan.date === record.date &&
      (!plan.shift || normalizeShiftValue(plan.shift) === normalizeShiftValue(record.shift)) &&
      normalize(plan.item) === normalize(record.product)
    );
    const row = matchingPlan
      ? ensure(record.sourceType, record.product, matchingPlan.date, matchingPlan.shift)
      : ensure(record.sourceType, record.product, record.date, normalizeShiftValue(record.shift));
    row.actualQuantity += record.quantity;
    row.actualSeconds += record.realSeconds;
  });

  return [...map.values()]
    .map((row) => ({
      ...row,
      quantityVariance: row.actualQuantity - row.plannedQuantity,
      timeVariance: row.actualSeconds - row.plannedSeconds,
      fulfillment: safeDivide(row.actualQuantity, row.plannedQuantity) * 100,
      situation: row.plannedQuantity ? row.actualQuantity ? "Planejado realizado" : "Planejado nao realizado" : "Nao planejado"
    }))
    .sort((a, b) => `${a.date}|${a.tipo}|${a.item}`.localeCompare(`${b.date}|${b.tipo}|${b.item}`));
}

function periodItemRows(records, plans) {
  const map = new Map();
  itemComparisonRows(records, plans).forEach((item) => {
    const key = `${item.type}|${item.item}`;
    if (!map.has(key)) {
      map.set(key, {
        tipo: item.tipo,
        type: item.type,
        item: item.item,
        plannedQuantity: 0,
        actualQuantity: 0,
        quantityVariance: 0,
        plannedSeconds: 0,
        actualSeconds: 0,
        timeVariance: 0,
        fulfillment: 0,
        situation: "Planejado"
      });
    }
    const row = map.get(key);
    row.plannedQuantity += item.plannedQuantity;
    row.actualQuantity += item.actualQuantity;
    row.plannedSeconds += item.plannedSeconds;
    row.actualSeconds += item.actualSeconds;
  });
  return [...map.values()]
    .map((row) => ({
      ...row,
      quantityVariance: row.actualQuantity - row.plannedQuantity,
      timeVariance: row.actualSeconds - row.plannedSeconds,
      fulfillment: safeDivide(row.actualQuantity, row.plannedQuantity) * 100,
      situation: row.plannedQuantity ? row.actualQuantity ? "Planejado realizado" : "Planejado nao realizado" : "Nao planejado"
    }))
    .sort((a, b) => `${a.tipo}|${a.item}`.localeCompare(`${b.tipo}|${b.item}`));
}

function formatPercent(value) {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function number(value) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function decimal(value, digits = 2) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

function splitQuantity(quantity, parts) {
  const total = Math.max(0, Number(quantity) || 0);
  if (!total) return [];
  const isWhole = Math.abs(total - Math.round(total)) < 0.0001;
  const count = Math.max(1, Math.min(parts, isWhole ? Math.round(total) : parts));
  if (!isWhole) return Array.from({ length: count }, () => total / count).filter(Boolean);
  const base = Math.floor(total / count);
  const remainder = Math.round(total) % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0)).filter(Boolean);
}

function createMachinePlan(items, units, machineCount = 14) {
  const machines = Array.from({ length: Math.max(1, Number(machineCount) || 14) }, (_, index) => ({
    machine: index + 1,
    seconds: 0,
    quantity: 0,
    tasks: []
  }));
  const tasks = items
    .map((item) => {
      const unit = cutUnitForStructure(units, item.structure);
      return {
        ...item,
        unit,
        totalSeconds: unit * item.quantity
      };
    })
    .filter((item) => item.unit && item.quantity > 0)
    .sort((a, b) => b.totalSeconds - a.totalSeconds);

  tasks.forEach((item) => {
    splitQuantity(item.quantity, machines.length).forEach((quantity) => {
      const machine = machines.reduce((best, current) => current.seconds < best.seconds ? current : best, machines[0]);
      const seconds = item.unit * quantity;
      const stages = item.structure.piecesPerStage ? quantity / Number(item.structure.piecesPerStage) : 0;
      const task = {
        machine: machine.machine,
        structure: item.structure,
        productPath: item.productPath,
        quantity,
        stages,
        unit: item.unit,
        seconds
      };
      machine.tasks.push(task);
      machine.seconds += seconds;
      machine.quantity += quantity;
    });
  });

  return machines;
}

function productCutPreview(expansion, units, machineCount = 14) {
  if (!expansion.items.length) return "";
  const totalQuantity = expansion.items.reduce((sum, item) => sum + item.quantity, 0);
  const totalStages = expansion.items.reduce((sum, item) => sum + item.stages, 0);
  const totalSeconds = expansion.items.reduce((sum, item) => sum + (cutUnitForStructure(units, item.structure) * item.quantity), 0);
  const machinePlan = createMachinePlan(expansion.items, units, machineCount);
  const activeMachines = machinePlan.filter((machine) => machine.tasks.length);
  return `
    <div class="planning-stage-preview">
      <div class="planning-stage-preview-summary">
        <strong>${number(expansion.items.length)} palco(s)</strong>
        <span>${number(totalQuantity)} un. para cortar</span>
        <span>${decimal(totalStages)} palco(s) estimado(s)</span>
        <span>${secondsToDuration(totalSeconds)}</span>
      </div>
      <div class="planning-stage-preview-list">
        ${expansion.items.map((item) => {
          const unit = cutUnitForStructure(units, item.structure);
          const total = unit * item.quantity;
          const stageLabel = [item.structure.cutStageCode, item.structure.stage].filter(Boolean).join(" - ");
          return `
            <div class="planning-stage-preview-row">
              <span title="${stageLabel}">${stageLabel}</span>
              <b>${number(item.quantity)} un.</b>
              <b>${decimal(item.stages)} palco(s)</b>
              <b>${unit ? `${secondsToDuration(unit)} un.` : "Sem tempo"}</b>
              <b>${total ? secondsToDuration(total) : "00:00:00"}</b>
              ${item.productPath ? `<small>${item.productPath}</small>` : ""}
            </div>
          `;
        }).join("")}
      </div>
      ${activeMachines.length ? `
        <div class="planning-machine-preview">
          <div class="planning-machine-preview-title">
            <strong>Plano sugerido nas ${number(machinePlan.length)} maquinas</strong>
            <span>${number(activeMachines.length)} maquina(s) com demanda | balanceado por menor carga acumulada</span>
          </div>
          <div class="planning-machine-grid">
            ${machinePlan.map((machine) => `
              <div class="planning-machine-card ${machine.tasks.length ? "" : "is-empty"}">
                <strong>Maquina ${machine.machine}</strong>
                <span>${secondsToDuration(machine.seconds)}</span>
                <small>${number(machine.quantity)} un.</small>
                ${machine.tasks.slice(0, 3).map((task) => {
                  const stageLabel = [task.structure.cutStageCode, task.structure.stage].filter(Boolean).join(" - ");
                  return `<em title="${stageLabel}">${stageLabel}: ${number(task.quantity)} un. | ${secondsToDuration(task.seconds)}</em>`;
                }).join("")}
                ${machine.tasks.length > 3 ? `<em>+ ${machine.tasks.length - 3} tarefa(s)</em>` : ""}
              </div>
            `).join("")}
          </div>
        </div>
      ` : ""}
    </div>
  `;
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
          <small>${number(row.actualQuantity)} un. | ${formatPercent(row.actualShare)} do realizado total</small>
          <em>${formatPercent(row.actualCapacityUse)} da capacidade</em>
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

function decodePayload(value, fallback) {
  try {
    return JSON.parse(decodeURIComponent(value || ""));
  } catch {
    return fallback;
  }
}

function unitFor(units, type, item, code = "") {
  const itemKey = normalize(item);
  if (!itemKey && !normalize(code)) return 0;
  const exact = units[`${type}|${itemKey}`] || units[`all|${itemKey}`];
  if (exact) return exact;

  const codeKey = normalize(code);
  const entries = Object.entries(units);
  const scoped = entries.filter(([key]) => key.startsWith(`${type}|`));
  const candidates = scoped.length ? scoped : entries;
  const codeMatch = codeKey ? candidates.find(([key]) => key.split("|")[1]?.split(/[^A-Z0-9]+/).includes(codeKey)) : null;
  if (codeMatch) return codeMatch[1];
  const nameMatch = candidates.find(([key]) => {
    const normalizedKey = key.split("|")[1] || "";
    return normalizedKey.includes(itemKey) || itemKey.includes(normalizedKey);
  });
  return nameMatch ? nameMatch[1] : 0;
}

function structuresForProduct(structures, product) {
  const productKey = normalize(product);
  return structures.filter((item) => normalize(item.product) === productKey && Number(item.unitsPerProduct) > 0);
}

function planningProductOptions(structures) {
  return unique([
    ...structures.map((item) => item.product),
    ...structures.filter((item) => !isCompoundStructure(item)).map((item) => item.stage)
  ]);
}

function isCompoundStructure(item) {
  return item?.structureKind === "compound" || normalize(item?.cutStageCode) === "PRODUTO";
}

function structureTime(item, field) {
  return parseTime(item?.[field]) || 0;
}

function cutUnitForStructure(units, structure) {
  return unitFor(units, "corte", structure.stage, structure.cutStageCode) || structureTime(structure, "cutUnitTime");
}

function stageOption(structure) {
  return structure.cutStageCode ? `${structure.cutStageCode} - ${structure.stage}` : structure.stage;
}

function structureForStageSelection(structures, value) {
  const key = normalize(value);
  return structures
    .filter((item) => !isCompoundStructure(item))
    .find((item) => {
      const code = normalize(item.cutStageCode);
      const stage = normalize(item.stage);
      const option = normalize(stageOption(item));
      return key === code || key === stage || key === option || option.includes(key) || key.includes(stage);
    });
}

function assemblyUnitForProduct(units, structures, product, trail = []) {
  const productKey = normalize(product);
  if (trail.includes(productKey)) return 0;
  const matches = structuresForProduct(structures, product);
  const compoundRows = matches.filter(isCompoundStructure);
  if (compoundRows.length) {
    return compoundRows.reduce((sum, row) => sum + (assemblyUnitForProduct(units, structures, row.stage, [...trail, productKey]) * Number(row.unitsPerProduct || 0)), 0);
  }
  const configured = matches.map((item) => structureTime(item, "assemblyUnitTime")).find(Boolean);
  return configured || unitFor(units, "montagem", product) || unitFor(units, "all", product);
}

function structurePieces(row, productQuantity) {
  const quantity = productQuantity * Number(row.unitsPerProduct || 0);
  const stages = row.piecesPerStage ? quantity / Number(row.piecesPerStage) : 0;
  return { quantity, stages };
}

function expandProductToCutItems(structures, product, productQuantity, trail = []) {
  const productKey = normalize(product);
  if (trail.includes(productKey)) {
    return { items: [], issues: [`${product}: estrutura circular`] };
  }
  let matches = structuresForProduct(structures, product);
  if (!matches.length) {
    const directStage = structureForStageSelection(structures, product);
    if (directStage) matches = [{ ...directStage, unitsPerProduct: directStage.unitsPerProduct || 1 }];
  }
  if (!matches.length) {
    return { items: [], issues: [`${product}: sem estrutura cadastrada`] };
  }
  return matches.reduce((result, structure) => {
    if (isCompoundStructure(structure)) {
      const childQuantity = productQuantity * Number(structure.unitsPerProduct || 0);
      const child = expandProductToCutItems(structures, structure.stage, childQuantity, [...trail, productKey]);
      result.items.push(...child.items.map((item) => ({
        ...item,
        productPath: [structure.stage, item.productPath].filter(Boolean).join(" > ")
      })));
      result.issues.push(...child.issues);
      return result;
    }
    const pieces = structurePieces(structure, productQuantity);
    result.items.push({
      structure,
      quantity: pieces.quantity,
      stages: pieces.stages,
      productPath: ""
    });
    return result;
  }, { items: [], issues: [] });
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
      ${capacityMetricLane("Realizado", row.actualSeconds, row.capacitySeconds, "#0f5f8f", `${formatPercent(row.actualShare)} do realizado total | ${formatPercent(row.actualCapacityUse)} da capacidade`)}
    </section>
  `;
}

function planningItemRow() {
  return `
    <tr class="planning-item-row">
      <td>
        <input name="item" list="planning-products" placeholder="Produto pronto" required>
        <small data-theoretical-note>Escolha um produto pronto da estrutura.</small>
        <div data-stage-preview></div>
      </td>
      <td><input type="number" min="0" step="1" name="quantity" required></td>
      <td><input name="theoreticalTotal" placeholder="Automatico" readonly required></td>
      <td><input name="observation" placeholder="Opcional"></td>
      <td><button class="button" type="button" data-action="remove-plan-row">Remover</button></td>
    </tr>
  `;
}

function planForm(records, plans, filters) {
  const settings = loadOperationalSettings();
  const structures = settings.productStructures || [];
  const products = planningProductOptions(structures);
  const stages = unique(structures.filter((item) => !isCompoundStructure(item)).map(stageOption));
  const unitsPayload = encodeURIComponent(JSON.stringify(theoreticalUnits(records)));
  const structuresPayload = encodeURIComponent(JSON.stringify(structures));
  const machineCount = settings.planningConnection.cuttingMachines || 14;
  return `
    <article class="panel planning-form-panel">
      <div class="section-title">
        <div>
          <h2>Lancar plano geral</h2>
          <p>Informe o volume planejado do dia. O lancamento sera enviado para a planilha de planejamento.</p>
        </div>
      </div>
      <datalist id="planning-products">${products.map((item) => `<option value="${item}"></option>`).join("")}</datalist>
      <datalist id="planning-stages">${stages.map((item) => `<option value="${item}"></option>`).join("")}</datalist>
      <form id="planning-form" class="planning-form" data-theoretical-units="${unitsPayload}" data-product-structures="${structuresPayload}" data-machine-count="${machineCount}">
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
          <label>Modo do corte
            <select name="cutMode">
              <option value="product">Produto completo</option>
              <option value="stage">Palco especifico</option>
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
                <th data-planning-item-heading>Produto pronto</th>
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
      <div class="section-title"><h2>Planejado x realizado por item</h2><span>Periodo filtrado</span></div>
      ${tableShell("planning-comparison-table")}
    </section>
    <section class="panel">
      <div class="section-title"><h2>Plano lancado</h2><span>${plans.length} registro(s)</span></div>
      ${tableShell("planning-table")}
    </section>
  `;
}

export function mountPlanning(records, planning, filters, onSave) {
  const plans = (planning?.plans || []).filter((plan) => planMatchesFilters(plan, filters));
  const dates = dateRange(filters, records, plans);
  renderTable("planning-comparison-table", periodItemRows(records, plans), [
    { title: "Base", field: "tipo" },
    { title: "Item planejado", field: "item", headerFilter: true },
    { title: "Situacao", field: "situation", headerFilter: true },
    { title: "Qtd planejada", field: "plannedQuantity", formatter: (cell) => number(cell.getValue()), hozAlign: "right" },
    { title: "Qtd realizada", field: "actualQuantity", formatter: (cell) => number(cell.getValue()), hozAlign: "right" },
    { title: "Dif. qtd", field: "quantityVariance", formatter: (cell) => number(cell.getValue()), hozAlign: "right" },
    { title: "Horas planejadas", field: "plannedSeconds", formatter: (cell) => secondsToDuration(cell.getValue()) },
    { title: "Horas realizadas", field: "actualSeconds", formatter: (cell) => secondsToDuration(cell.getValue()) },
    { title: "Dif. horas", field: "timeVariance", formatter: (cell) => secondsToDuration(cell.getValue()) },
    { title: "% realizado", field: "fulfillment", formatter: (cell) => cell.getData().plannedQuantity ? formatPercent(cell.getValue()) : "Fora do plano" }
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

  const formEl = document.querySelector("#planning-form");
  const refreshItemMode = () => {
    if (!formEl) return;
    const type = formEl.elements.type.value;
    const cutMode = formEl.elements.cutMode?.value || "product";
    const stageMode = type === "corte" && cutMode === "stage";
    document.querySelector("[data-planning-item-heading]").textContent = stageMode ? "Palco especifico" : "Produto pronto";
    formEl.querySelectorAll(".planning-item-row [name='item']").forEach((input) => {
      input.setAttribute("list", stageMode ? "planning-stages" : "planning-products");
      input.setAttribute("placeholder", stageMode ? "Palco especifico" : "Produto pronto");
    });
    formEl.querySelectorAll("[data-theoretical-note]").forEach((note) => {
      if (!note.closest(".planning-item-row")?.querySelector("[name='item']").value) {
        note.textContent = stageMode ? "Escolha um palco especifico da estrutura." : "Escolha um produto pronto da estrutura.";
      }
    });
    if (stageMode || type !== "corte") {
      formEl.querySelectorAll("[data-stage-preview]").forEach((preview) => {
        preview.innerHTML = "";
      });
    }
  };
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
    const units = decodePayload(formEl.dataset.theoreticalUnits, {});
    const structures = decodePayload(formEl.dataset.productStructures, []);
    const machineCount = Number(formEl.dataset.machineCount || 14);
    const type = formEl.elements.type.value;
    const cutMode = formEl.elements.cutMode?.value || "items";
    const itemInput = row.querySelector("[name='item']");
    const quantityInput = row.querySelector("[name='quantity']");
    const totalInput = row.querySelector("[name='theoreticalTotal']");
    const preview = row.querySelector("[data-stage-preview]");
    const item = normalize(itemInput?.value);
    const quantity = Number(quantityInput?.value || 0);
    if (preview) preview.innerHTML = "";
    if (type === "corte" && cutMode === "stage" && item && quantity) {
      const structure = structureForStageSelection(structures, item);
      const unit = structure ? cutUnitForStructure(units, structure) : 0;
      const total = unit * quantity;
      totalInput.value = total ? secondsToDuration(total) : "";
      const note = row.querySelector("[data-theoretical-note]");
      if (note) {
        note.textContent = structure && unit
          ? `Palco ${structure.cutStageCode || ""} | ${structure.stage} | ${secondsToDuration(unit)} x ${number(quantity)} un. = ${secondsToDuration(total)}`
          : "Palco sem tempo teorico encontrado. Confira o cadastro na estrutura de produtos.";
      }
      if (preview && structure && unit) {
        preview.innerHTML = productCutPreview({ items: [{ structure, quantity, stages: structure.piecesPerStage ? quantity / Number(structure.piecesPerStage) : 0, productPath: "" }], issues: [] }, units, machineCount);
      }
      refreshPlanningTotals();
      return;
    }
    if (type === "corte" && cutMode === "product" && item && quantity) {
      const expansion = expandProductToCutItems(structures, item, quantity);
      const missingUnits = [];
      const total = expansion.items.reduce((sum, item) => {
        const unit = cutUnitForStructure(units, item.structure);
        if (!unit) missingUnits.push(item.structure.cutStageCode || item.structure.stage);
        return sum + (unit * item.quantity);
      }, 0);
      totalInput.value = expansion.items.length && !expansion.issues.length && !missingUnits.length && total ? secondsToDuration(total) : "";
      const note = row.querySelector("[data-theoretical-note]");
      if (note) {
        const stages = expansion.items.reduce((sum, item) => sum + item.stages, 0);
        if (expansion.issues.length) {
          note.textContent = expansion.issues[0];
        } else if (missingUnits.length) {
          note.textContent = `Estrutura encontrada (${expansion.items.length} palco(s)), mas falta tempo teorico para: ${missingUnits.slice(0, 3).join(", ")}.`;
        } else {
          note.textContent = `${expansion.items.length} palco(s) de corte | ${stages.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} palco(s) estimado(s) | Total ${secondsToDuration(total)}`;
        }
      }
      if (preview && expansion.items.length) {
        preview.innerHTML = productCutPreview(expansion, units, machineCount);
      }
      refreshPlanningTotals();
      return;
    }
    const unit = type === "montagem"
      ? assemblyUnitForProduct(units, structures, item)
      : unitFor(units, type, item);
    const total = unit * quantity;
    totalInput.value = total ? secondsToDuration(total) : "";
    const note = row.querySelector("[data-theoretical-note]");
    if (note) {
      note.textContent = unit
        ? `Tempo unitario encontrado: ${secondsToDuration(unit)} x ${number(quantity)} un. = ${secondsToDuration(total)}`
        : "Tempo teorico unitario nao encontrado para este produto pronto. Cadastre o tempo de montagem na estrutura ou na base real.";
    }
    refreshPlanningTotals();
  };
  const refreshAllRows = () => {
    refreshItemMode();
    document.querySelectorAll(".planning-item-row").forEach(refreshTheoreticalTotal);
  };
  formEl?.elements.type.addEventListener("change", refreshAllRows);
  formEl?.elements.cutMode?.addEventListener("change", refreshAllRows);
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
    refreshItemMode();
    refreshPlanningTotals();
  });
  refreshAllRows();

  formEl?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const units = decodePayload(event.currentTarget.dataset.theoreticalUnits, {});
    const structures = decodePayload(event.currentTarget.dataset.productStructures, []);
    const machineCount = Number(event.currentTarget.dataset.machineCount || 14);
    const baseType = form.get("type");
    const cutMode = form.get("cutMode");
    let rowsToSave = [...event.currentTarget.querySelectorAll(".planning-item-row")]
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
    if (baseType === "corte" && cutMode === "stage") {
      const issues = [];
      const machineRows = [];
      rowsToSave.forEach((row) => {
        const structure = structureForStageSelection(structures, row.item);
        if (!structure) {
          issues.push(`${row.item}: palco nao encontrado na estrutura`);
          return;
        }
        const unit = cutUnitForStructure(units, structure);
        if (!unit) {
          issues.push(`${row.item}: sem tempo teorico`);
          return;
        }
        createMachinePlan([{ structure, quantity: row.quantity, stages: structure.piecesPerStage ? row.quantity / Number(structure.piecesPerStage) : 0, productPath: "" }], units, machineCount)
          .flatMap((machine) => machine.tasks)
          .forEach((task) => {
            machineRows.push({
              item: normalize(structure.stage),
              quantity: task.quantity,
              theoreticalTotalSeconds: task.seconds,
              observation: [
                `Lancamento por palco especifico`,
                `Maquina: ${task.machine}`,
                structure.cutStageCode ? `Palco: ${structure.cutStageCode}` : "",
                task.stages ? `${decimal(task.stages)} palco(s)` : "",
                row.observation
              ].filter(Boolean).join(" | ")
            });
          });
      });
      if (issues.length) {
        alert(`Nao foi possivel salvar o palco especifico:\n${issues.slice(0, 8).join("\n")}`);
        return;
      }
      rowsToSave = machineRows;
    }
    if (baseType === "corte" && cutMode === "product") {
      const expandedRows = [];
      const issues = [];
      rowsToSave.forEach((row) => {
        const expansion = expandProductToCutItems(structures, row.item, row.quantity);
        issues.push(...expansion.issues);
        const missingUnit = expansion.items.find((item) => !cutUnitForStructure(units, item.structure));
        if (missingUnit) {
          issues.push(`${row.item} > ${missingUnit.structure.cutStageCode || missingUnit.structure.stage}: sem tempo teorico`);
          return;
        }
        createMachinePlan(expansion.items, units, machineCount).flatMap((machine) => machine.tasks).forEach((task) => {
          const structure = task.structure;
          const stagesText = task.stages
            ? `${task.stages.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} palco(s)`
            : "palcos sem capacidade cadastrada";
          expandedRows.push({
            item: normalize(structure.stage),
            quantity: task.quantity,
            theoreticalTotalSeconds: task.seconds,
            observation: [
              `Produto pronto: ${row.item}`,
              task.productPath ? `Componente: ${task.productPath}` : "",
              `Qtd produto: ${number(row.quantity)}`,
              `Maquina: ${task.machine}`,
              structure.cutStageCode ? `Palco: ${structure.cutStageCode}` : "",
              stagesText,
              row.observation
            ].filter(Boolean).join(" | ")
          });
        });
      });
      if (issues.length) {
        alert(`Nao foi possivel desdobrar o plano de corte:\n${issues.slice(0, 8).join("\n")}`);
        return;
      }
      rowsToSave = expandedRows;
    }
    try {
      for (const row of rowsToSave) {
        await savePlanRecord({
          type: baseType,
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
