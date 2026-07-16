export function loadingState(message = "Carregando dados") {
  return `<div class="loading"><span class="spinner"></span><strong>${message}</strong></div>`;
}

export function emptyState(message = "Nenhum dado encontrado para os filtros selecionados.") {
  return `<div class="empty-state">${message}</div>`;
}
