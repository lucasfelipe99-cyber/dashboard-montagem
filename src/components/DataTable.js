import { TabulatorFull as Tabulator } from "tabulator-tables";

let currentTables = [];

export function tableShell(id) {
  return `<div id="${id}" class="data-table"></div>`;
}

export function destroyTables() {
  currentTables.forEach((table) => table.destroy());
  currentTables = [];
}

export function renderTable(id, data, columns, options = {}) {
  const el = document.getElementById(id);
  if (!el) return null;
  const table = new Tabulator(el, {
    data,
    layout: "fitColumns",
    pagination: true,
    paginationSize: options.paginationSize || 10,
    movableColumns: true,
    selectableRows: 1,
    height: options.height || "420px",
    columns,
    rowFormatter: options.rowFormatter
  });
  currentTables.push(table);
  return table;
}
