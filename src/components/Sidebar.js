export const pages = [
  ["overview", "Visão Geral", "layout-dashboard"],
  ["timeline", "Linha do Tempo", "gantt-chart"],
  ["employees", "Funcionários", "users"],
  ["products", "Produtos", "package"],
  ["times", "Análise de Tempos", "timer"],
  ["settings", "Configurações", "settings"],
  ["database", "Base de Dados", "table-2"]
];

export function Sidebar(activePage) {
  return `
    <aside class="sidebar">
      <div class="brand"><i data-lucide="factory"></i><span>Fábrica</span></div>
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
