import { aggregateBy } from "../utils/calculations.js";
import { tableShell, renderTable } from "../components/DataTable.js";
import { dateTimeLabel, secondsToDuration } from "../utils/dateUtils.js";
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
    return a.sortStart - b.sortStart || a.product.localeCompare(b.product) || a.employee.localeCompare(b.employee);
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

export function Products() {
  return `
    <section class="page-heading"><h1>Produtos</h1><p>Desempenho por produto, participação na produção e comparação real versus teórica.</p></section>
    <section class="panel detail-panel employee-summary-panel" id="product-detail"><h2>Resumo do produto</h2><p>Selecione um produto na tabela.</p></section>
    <section class="panel">${tableShell("products-table")}</section>
    <section class="panel employee-analysis-panel" id="product-activity-detail"></section>
  `;
}

export function mountProducts(records) {
  const production = records.filter((r) => !r.isIdle && !r.isBreak);
  const total = production.reduce((sum, item) => sum + item.quantity, 0);
  const rows = aggregateBy(production, "product").map((item) => ({
    product: item.key,
    bases: [...new Set(item.items.map((r) => r.sourceName).filter(Boolean))].join(", "),
    quantity: item.totalQuantity,
    employees: new Set(item.items.map((r) => r.employee)).size,
    activities: item.items.length,
    real: item.realSeconds,
    theory: item.theoreticalSeconds,
    avgUnit: item.totalQuantity ? item.realSeconds / item.totalQuantity : 0,
    theoryUnit: item.totalQuantity ? item.theoreticalSeconds / item.totalQuantity : 0,
    efficiency: item.efficiency,
    variance: item.variance,
    variancePct: item.theoreticalSeconds ? (item.variance / item.theoreticalSeconds) * 100 : 0,
    share: total ? (item.totalQuantity / total) * 100 : 0,
    items: item.items
  }));

  const detailPanel = document.getElementById("product-activity-detail");
  if (detailPanel) detailPanel.innerHTML = detailTable("Todos os lançamentos", records);

  const table = renderTable("products-table", rows, [
    { title: "Base", field: "bases", headerFilter: true },
    { title: "Produto", field: "product", headerFilter: true },
    { title: "Quantidade", field: "quantity", sorter: "number" },
    { title: "Funcionários", field: "employees", sorter: "number" },
    { title: "Atividades", field: "activities", sorter: "number" },
    { title: "Real", field: "real", formatter: (c) => secondsToDuration(c.getValue()) },
    { title: "Teórico", field: "theory", formatter: (c) => secondsToDuration(c.getValue()) },
    { title: "Média/un.", field: "avgUnit", formatter: (c) => secondsToDuration(c.getValue()) },
    { title: "Eficiência", field: "efficiency", formatter: (c) => percent(c.getValue()) },
    { title: "Variação %", field: "variancePct", formatter: (c) => percent(c.getValue()) },
    { title: "Participação", field: "share", formatter: (c) => percent(c.getValue()) }
  ]);

  table?.on("rowClick", (_, row) => {
    const data = row.getData();
    document.getElementById("product-detail").innerHTML = `
      <h2>${escapeHtml(data.product)}</h2>
      <div class="mini-kpis">
        <span>Quantidade<strong>${data.quantity}</strong></span>
        <span>Eficiência<strong>${percent(data.efficiency)}</strong></span>
        <span>Real<strong>${secondsToDuration(data.real)}</strong></span>
        <span>Teórico<strong>${secondsToDuration(data.theory)}</strong></span>
      </div>
    `;
    document.getElementById("product-activity-detail").innerHTML = detailTable(
      data.product,
      data.items,
      "Lançamentos do produto no período filtrado."
    );
  });
}
