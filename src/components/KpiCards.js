import { hours, number, percent } from "../utils/formatters.js";

export function KpiCards(summary) {
  const cards = [
    ["Quantidade total", number(summary.totalQuantity), "boxes"],
    ["Funcionários ativos", number(summary.employees), "users"],
    ["Horas reais", hours(summary.realSeconds), "clock"],
    ["Horas teóricas", hours(summary.theoreticalSeconds), "timer"],
    ["Eficiência geral", percent(summary.efficiency), "gauge"],
    ["Produtividade/hora", number(summary.productivity, 1), "trending-up"],
    ["Ociosidade", hours(summary.idleSeconds), "pause-circle"],
    ["Ocupação", percent(summary.occupation), "activity"],
    ["Concluídas", number(summary.done), "check-circle-2"],
    ["Em andamento", number(summary.running), "loader"],
    ["Variação real x teórico", hours(summary.variance), "scale"],
    ["Produtos diferentes", number(summary.products), "package"]
  ];
  return `<section class="kpi-grid">${cards.map(([label, value, icon]) => `
    <article class="kpi-card"><i data-lucide="${icon}"></i><span>${label}</span><strong>${value}</strong></article>
  `).join("")}</section>`;
}
