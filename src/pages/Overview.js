import { summarize } from "../utils/calculations.js";
import { KpiCards } from "../components/KpiCards.js";
import { chartGrid, renderCharts } from "../components/Charts.js";
import { tableShell, renderTable } from "../components/DataTable.js";
import { statusBadge } from "../components/StatusBadge.js";
import { secondsToClock, secondsToDuration } from "../utils/dateUtils.js";

export function Overview(records, filters = {}) {
  const running = records.filter((record) => record.isRunning && !record.isIdle);
  return `
    ${KpiCards(summarize(records, { capacityMode: "factory", filters }))}
    <section class="panel">
      <div class="section-title"><h2>Produção em andamento</h2><span>${running.length} atividade(s)</span></div>
      ${tableShell("running-table")}
    </section>
    ${chartGrid()}
  `;
}

export function mountOverview(records) {
  renderTable("running-table", records.filter((record) => record.isRunning && !record.isIdle), [
    { title: "Base", field: "sourceName", headerFilter: true },
    { title: "Funcionário", field: "employee", headerFilter: true },
    { title: "Atividade atual", field: "product", headerFilter: true },
    { title: "Produto", field: "product" },
    { title: "Início", field: "startSeconds", formatter: (cell) => secondsToClock(cell.getValue()) },
    { title: "Tempo decorrido", field: "realSeconds", formatter: (cell) => secondsToDuration(cell.getValue()) },
    { title: "Quantidade", field: "quantity", hozAlign: "right" },
    { title: "Turno", field: "shift" },
    { title: "Status", field: "status", formatter: (cell) => statusBadge(cell.getValue()) }
  ], { height: "260px" });
  renderCharts(records);
}
