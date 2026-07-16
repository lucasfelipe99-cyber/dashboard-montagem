export function Header(state) {
  const sourceLabel = `Google Sheets: ${state.dataset?.connection?.sheetName || "DB"}`;

  return `
    <header class="topbar">
      <button class="icon-button sidebar-toggle" aria-label="Recolher menu" data-action="toggle-sidebar"><i data-lucide="panel-left"></i></button>
      <div>
        <strong>Dashboard de Montagem</strong>
        <span>${sourceLabel}</span>
      </div>
      <div class="topbar-actions">
        <span class="last-update">Última atualização: ${state.lastUpdate || "--"}</span>
        <button class="button ghost" data-action="refresh"><i data-lucide="refresh-cw"></i> Atualizar dados</button>
        <button class="button ghost" data-action="presentation"><i data-lucide="monitor-up"></i> TV</button>
      </div>
    </header>
  `;
}
