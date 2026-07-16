export const pages = [
  ["overview", "Visao Geral", "layout-dashboard"],
  ["timeline", "Linha do Tempo", "gantt-chart"],
  ["employees", "Funcionarios", "users"],
  ["products", "Produtos", "package"],
  ["times", "Analise de Tempos", "timer"],
  ["planning", "Planejamento", "clipboard-list"],
  ["settings", "Configuracoes", "settings"],
  ["database", "Base de Dados", "table-2"]
];

export function Sidebar(activePage) {
  return `
    <aside class="sidebar">
      <div class="brand"><i data-lucide="factory"></i><span>Fabrica</span></div>
      <nav>
        ${pages.map(([id, label, icon]) => `
          <button class="nav-item ${activePage === id ? "active" : ""}" data-page="${id}">
            <i data-lucide="${icon}"></i><span>${label}</span>
          </button>
        `).join("")}
      </nav>
    </aside>
  `;
}
