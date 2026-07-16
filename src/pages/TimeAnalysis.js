import { aggregateBy, summarize } from "../utils/calculations.js";
import { KpiCards } from "../components/KpiCards.js";
import { tableShell, renderTable } from "../components/DataTable.js";
import { secondsToClock, secondsToDuration } from "../utils/dateUtils.js";
import { percent } from "../utils/formatters.js";

export function TimeAnalysis(records) {
  const deviations = records.filter((r) => !r.isIdle).sort((a, b) => Math.abs(b.realSeconds - b.theoreticalTotalSeconds) - Math.abs(a.realSeconds - a.theoreticalTotalSeconds)).slice(0, 8);
  return `
    <section class="page-heading"><h1>Análise de Tempos</h1><p>Variações, eficiência, distribuição de duração, produtividade e ociosidade.</p></section>
    ${KpiCards(summarize(records))}
    <section class="insight-grid">
      <article class="panel"><h2>Produtos com maior desvio</h2><ul class="compact-list">${aggregateBy(records.filter((r) => !r.isIdle), "product").sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, 8).map((x) => `<li>${x.key}<strong>${secondsToDuration(x.variance)}</strong></li>`).join("")}</ul></article>
      <article class="panel"><h2>Funcionários com maior desvio</h2><ul class="compact-list">${aggregateBy(records.filter((r) => !r.isIdle), "employee").sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, 8).map((x) => `<li>${x.key}<strong>${secondsToDuration(x.variance)}</strong></li>`).join("")}</ul></article>
      <article class="panel"><h2>Atividades mais rápidas</h2><ul class="compact-list">${records.filter((r) => !r.isIdle).sort((a, b) => a.realSeconds - b.realSeconds).slice(0, 8).map((r) => `<li>${r.employee} - ${r.product}<strong>${secondsToDuration(r.realSeconds)}</strong></li>`).join("")}</ul></article>
      <article class="panel"><h2>Atividades mais demoradas</h2><ul class="compact-list">${deviations.map((r) => `<li>${r.employee} - ${r.product}<strong>${secondsToDuration(r.realSeconds)}</strong></li>`).join("")}</ul></article>
    </section>
    <section class="panel"><div class="section-title"><h2>Tabela de desvios</h2></div>${tableShell("deviations-table")}</section>
  `;
}

export function mountTimeAnalysis(records) {
  renderTable("deviations-table", records.filter((r) => !r.isIdle), [
    { title: "Base", field: "sourceName", headerFilter: true },
    { title: "Data", field: "date", headerFilter: true },
    { title: "Funcionário", field: "employee", headerFilter: true },
    { title: "Turno", field: "shift", headerFilter: true },
    { title: "Produto", field: "product", headerFilter: true },
    { title: "Quantidade", field: "quantity", sorter: "number" },
    { title: "Início", field: "startSeconds", formatter: (c) => secondsToClock(c.getValue()) },
    { title: "Tempo real", field: "realSeconds", formatter: (c) => secondsToDuration(c.getValue()) },
    { title: "Tempo teórico", field: "theoreticalTotalSeconds", formatter: (c) => secondsToDuration(c.getValue()) },
    { title: "Variação", field: "realSeconds", formatter: (c) => secondsToDuration(c.getRow().getData().realSeconds - c.getRow().getData().theoreticalTotalSeconds) },
    { title: "Variação %", field: "realSeconds", formatter: (c) => percent(c.getRow().getData().theoreticalTotalSeconds ? ((c.getValue() - c.getRow().getData().theoreticalTotalSeconds) / c.getRow().getData().theoreticalTotalSeconds) * 100 : 0) },
    { title: "Eficiência", field: "realSeconds", formatter: (c) => percent(c.getRow().getData().theoreticalTotalSeconds ? (c.getRow().getData().theoreticalTotalSeconds / c.getValue()) * 100 : 0) },
    { title: "Status", field: "status", headerFilter: true }
  ]);
}
