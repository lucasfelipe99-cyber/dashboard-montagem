import { aggregateBy } from "../utils/calculations.js";
import { tableShell, renderTable } from "../components/DataTable.js";
import { dateTimeLabel, secondsToClock, secondsToDuration } from "../utils/dateUtils.js";
import { number, percent } from "../utils/formatters.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function variationClass(value) {
  if (value > 0) return "is-positive";
  if (value < 0) return "is-negative";
  return "";
}

function detailRows(items) {
  const rows = items.filter((item) => !item.isBreak).map((item) => {
    const quantity = item.quantity || 0;
    const real = item.realSeconds || 0;
    const theory = item.theoreticalTotalSeconds || 0;
    const realUnit = quantity ? real / quantity : 0;
    const theoryUnit = quantity ? theory / quantity : 0;
    return {
      source: item.sourceName || "",
      employee: item.employee || "",
      product: item.product || "Sem informação",
      quantity,
      real,
      realUnit,
      theory,
      theoryUnit,
      variation: theory - real,
      variationUnit: theoryUnit - realUnit,
      start: Number.isFinite(item.absoluteStart) ? dateTimeLabel(item.absoluteStart) : "",
      end: item.isRunning ? "Em andamento" : Number.isFinite(item.absoluteEnd) ? dateTimeLabel(item.absoluteEnd) : "",
      sortStart: Number.isFinite(item.absoluteStart) ? item.absoluteStart : Number.MAX_SAFE_INTEGER
    };
  }).sort((a, b) => {
    return a.sortStart - b.sortStart || a.employee.localeCompare(b.employee) || a.product.localeCompare(b.product);
  });

  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  const totalReal = rows.reduce((sum, row) => sum + row.real, 0);
  const totalTheory = rows.reduce((sum, row) => sum + row.theory, 0);

  return [{
    source: "",
    employee: "",
    product: "TOTAL",
    quantity: totalQuantity,
    real: totalReal,
    realUnit: totalQuantity ? totalReal / totalQuantity : 0,
    theory: totalTheory,
    theoryUnit: totalQuantity ? totalTheory / totalQuantity : 0,
    variation: totalTheory - totalReal,
    variationUnit: totalQuantity ? (totalTheory - totalReal) / totalQuantity : 0,
    start: "",
    end: "",
    total: true
  }, ...rows];
}

function detailTable(title, items, subtitle = "Todos os lançamentos do período filtrado.") {
  const rows = detailRows(items);
  if (!items.length) {
    return `
      <h2>${escapeHtml(title)}</h2>
      <p>Nenhum lançamento encontrado para o período filtrado.</p>
    `;
  }

  return `
    <div class="section-title">
      <div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(subtitle)}</p>
      </div>
    </div>
    <div class="employee-analysis-table-wrap">
      <table class="employee-analysis-table employee-detail-table">
        <thead>
          <tr>
            <th>Origem</th>
            <th>Funcionário</th>
            <th>Produto / Atividade</th>
            <th>Qtd Produzida</th>
            <th>Início</th>
            <th>Final</th>
            <th>Hora de Montagem</th>
            <th>Hora montagem Un</th>
            <th>Hora Teórica</th>
            <th>Hora Teórica Un</th>
            <th>Variação T X R</th>
            <th>Variação T X R Un</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr class="${[row.total ? "is-total" : "", row.product === "OCIOSIDADE" ? "is-idle" : ""].filter(Boolean).join(" ")}">
              <td>${escapeHtml(row.source)}</td>
              <td>${escapeHtml(row.employee)}</td>
              <td>${escapeHtml(row.product)}</td>
              <td>${number(row.quantity, 0)}</td>
              <td>${escapeHtml(row.start)}</td>
              <td>${escapeHtml(row.end)}</td>
              <td>${secondsToDuration(row.real)}</td>
              <td>${secondsToDuration(row.realUnit)}</td>
              <td>${secondsToDuration(row.theory)}</td>
              <td>${secondsToDuration(row.theoryUnit)}</td>
              <td class="${variationClass(row.variation)}">${secondsToDuration(row.variation)}</td>
              <td class="${variationClass(row.variationUnit)}">${secondsToDuration(row.variationUnit)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function Employees() {
  return `
    <section class="page-heading"><h1>Funcionários</h1><p>Indicadores individuais, produtividade, ocupação, desvios e histórico.</p></section>
    <section class="panel detail-panel employee-summary-panel" id="employee-detail"><h2>Resumo do funcionário</h2><p>Selecione um funcionário na tabela.</p></section>
    <section class="panel">${tableShell("employees-table")}</section>
    <section class="panel employee-analysis-panel" id="employee-activity-detail"></section>
  `;
}

export function mountEmployees(records) {
  const rows = aggregateBy(records.filter((r) => !r.isIdle), "employee").map((item) => {
    const first = Math.min(...item.items.map((r) => r.startSeconds));
    const last = Math.max(...item.items.map((r) => r.endSeconds || r.absoluteEnd));
    const allItems = records.filter((r) => r.employee === item.key);
    return {
      employee: item.key,
      bases: [...new Set(allItems.map((r) => r.sourceName).filter(Boolean))].join(", "),
      shift: item.items[0]?.shift || "",
      quantity: item.totalQuantity,
      products: new Set(item.items.map((r) => r.product)).size,
      activities: item.items.length,
      real: item.realSeconds,
      theory: item.theoreticalSeconds,
      efficiency: item.efficiency,
      productivity: item.productivity,
      idle: records.filter((r) => r.employee === item.key && r.isIdle).reduce((s, r) => s + r.realSeconds, 0),
      occupation: item.occupation,
      first: secondsToClock(first),
      last: secondsToClock(last),
      avgUnit: item.totalQuantity ? item.realSeconds / item.totalQuantity : 0,
      variance: item.variance,
      items: allItems,
      productionItems: item.items
    };
  });

  const detailPanel = document.getElementById("employee-activity-detail");
  if (detailPanel) detailPanel.innerHTML = detailTable("Todos os lançamentos", records);

  const table = renderTable("employees-table", rows, [
    { title: "Base", field: "bases", headerFilter: true },
    { title: "Funcionário", field: "employee", headerFilter: true },
    { title: "Turno", field: "shift", headerFilter: true },
    { title: "Qtd.", field: "quantity", sorter: "number" },
    { title: "Produtos", field: "products", sorter: "number" },
    { title: "Ativ.", field: "activities", sorter: "number" },
    { title: "Horas reais", field: "real", formatter: (c) => secondsToDuration(c.getValue()) },
    { title: "Eficiência", field: "efficiency", formatter: (c) => percent(c.getValue()) },
    { title: "Prod/h", field: "productivity", formatter: (c) => number(c.getValue(), 1) },
    { title: "Ociosidade", field: "idle", formatter: (c) => secondsToDuration(c.getValue()) },
    { title: "Primeira", field: "first" },
    { title: "Última", field: "last" },
    { title: "Variação", field: "variance", formatter: (c) => secondsToDuration(c.getValue()) }
  ]);

  table?.on("rowClick", (_, row) => {
    const data = row.getData();
    document.getElementById("employee-detail").innerHTML = `
      <h2>${escapeHtml(data.employee)}</h2>
      <div class="mini-kpis">
        <span>Quantidade<strong>${data.quantity}</strong></span>
        <span>Eficiência<strong>${percent(data.efficiency)}</strong></span>
        <span>Prod/h<strong>${number(data.productivity, 1)}</strong></span>
        <span>Tempo médio/un.<strong>${secondsToDuration(data.avgUnit)}</strong></span>
      </div>
    `;
    document.getElementById("employee-activity-detail").innerHTML = detailTable(
      data.employee,
      data.items,
      "Lançamentos do funcionário no período filtrado."
    );
  });
}
