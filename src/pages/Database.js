import { tableShell, renderTable } from "../components/DataTable.js";

function rowsBySource(dataset, sourceType) {
  return (dataset?.rawRows || []).filter((row) => row.__sourceType === sourceType);
}

function sourcePanel({ id, title, description, rows, sourceType }) {
  return `
    <section class="panel">
      <div class="section-title">
        <div>
          <h2>${title}</h2>
          <p>${description}</p>
        </div>
        <span>${rows.length} linhas</span>
      </div>
      <button class="button" data-action="export-csv" data-source-type="${sourceType}"><i data-lucide="download"></i> Exportar CSV</button>
      ${rows.length ? tableShell(id) : `<p class="muted">Nenhuma linha carregada para esta base.</p>`}
    </section>
  `;
}

export function Database(dataset) {
  const assemblyRows = rowsBySource(dataset, "montagem");
  const cutRows = rowsBySource(dataset, "corte");
  return `
    <section class="page-heading">
      <h1>Base de Dados</h1>
      <p>Consulta separada dos registros originais de Montagem e Corte.</p>
    </section>
    ${sourcePanel({
      id: "database-assembly-table",
      title: "Base de Montagem",
      description: "Registros originais da planilha de montagem.",
      rows: assemblyRows,
      sourceType: "montagem"
    })}
    ${sourcePanel({
      id: "database-cut-table",
      title: "Base de Corte",
      description: "Registros originais da planilha de corte.",
      rows: cutRows,
      sourceType: "corte"
    })}
  `;
}

function columnsFromRows(rows) {
  const internalKeys = ["__sourceName", "__sourceType", "__sourceId"];
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((key) => !internalKeys.includes(key));
  return keys.map((key) => ({ title: key, field: key, headerFilter: true, minWidth: 140 }));
}

function renderSourceTable(id, rows) {
  if (!rows.length) return;
  renderTable(id, rows, columnsFromRows(rows), {
    height: "420px",
    paginationSize: 15,
    rowFormatter(row) {
      const data = row.getData();
      const text = JSON.stringify(data).toLowerCase();
      if (text.includes("\"\"")) row.getElement().classList.add("row-warning");
    }
  });
}

export function mountDatabase(dataset) {
  renderSourceTable("database-assembly-table", rowsBySource(dataset, "montagem"));
  renderSourceTable("database-cut-table", rowsBySource(dataset, "corte"));
}
