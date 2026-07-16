import { aggregateBy, groupBy } from "../utils/calculations.js";
import { secondsToClock, secondsToDuration } from "../utils/dateUtils.js";

const CHARTS = [
  "Produção por funcionário",
  "Horas reais versus teóricas por funcionário",
  "Produção por produto",
  "Produção ao longo do dia",
  "Eficiência por funcionário",
  "Ociosidade por funcionário",
  "Tempo real versus teórico por produto",
  "Quantidade produzida por turno"
];

export function chartGrid() {
  return `<section class="chart-grid">${CHARTS.map((title, index) => `
    <article class="panel chart-panel"><h3>${title}</h3><div id="chart-${index}" class="native-chart"></div></article>
  `).join("")}</section>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function sortBy(field, direction = "desc") {
  return (a, b) => direction === "desc" ? b[field] - a[field] : a[field] - b[field];
}

function formatValue(value, unit = "number") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  if (unit === "duration") return secondsToDuration(number);
  if (unit === "percent") return `${number.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  return number.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function tooltipText(title, values) {
  return [title, ...values].filter(Boolean).join("||");
}

function maxValue(rows, keys) {
  return Math.max(...rows.flatMap((row) => keys.map((key) => Number(row[key]) || 0)), 0);
}

function dispatchFilter(filter, label) {
  if (!filter || !label) return;
  window.dispatchEvent(new CustomEvent("chart-filter", { detail: { title: filter, label } }));
}

function barChart({ rows, labelKey = "key", valueKeys, names, colors, unit, filter }) {
  if (!rows.length) return `<div class="chart-empty">Sem dados no período filtrado</div>`;
  const max = maxValue(rows, valueKeys) || 1;
  return `
    <div class="native-chart-legend">
      ${names.map((name, index) => `<span><i style="background:${colors[index]}"></i>${escapeHtml(name)}</span>`).join("")}
    </div>
    <div class="native-bars">
      ${rows.map((row) => `
        <button class="native-bar-row" type="button" data-chart-filter="${escapeHtml(filter || "")}" data-chart-label="${escapeHtml(row[labelKey])}" data-chart-tooltip="${escapeHtml(tooltipText(row[labelKey], valueKeys.map((key, index) => `${names[index]}: ${formatValue(row[key], unit)}`)))}">
          <span class="native-bar-label" title="${escapeHtml(row[labelKey])}">${escapeHtml(row[labelKey])}</span>
          <span class="native-bar-track">
            ${valueKeys.map((key, index) => `
              <span class="native-bar" style="--bar:${Math.max(((Number(row[key]) || 0) / max) * 100, 1)}%;--color:${colors[index]}"></span>
            `).join("")}
          </span>
          <span class="native-bar-values">
            ${valueKeys.map((key, index) => `<b><i style="background:${colors[index]}"></i>${formatValue(row[key], unit)}</b>`).join("")}
          </span>
        </button>
      `).join("")}
    </div>
  `;
}

function lineChart({ rows, labelKey = "key", valueKey, color, unit }) {
  if (!rows.length) return `<div class="chart-empty">Sem dados no período filtrado</div>`;
  const width = 720;
  const height = 220;
  const padding = 28;
  const max = Math.max(...rows.map((row) => Number(row[valueKey]) || 0), 1);
  const points = rows.map((row, index) => {
    const x = rows.length === 1 ? width / 2 : padding + (index * (width - padding * 2)) / (rows.length - 1);
    const y = height - padding - ((Number(row[valueKey]) || 0) / max) * (height - padding * 2);
    return { ...row, x, y };
  });
  const path = points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");

  return `
    <div class="native-line-wrap">
      <svg class="native-line" viewBox="0 0 ${width} ${height}" role="img" aria-label="Produção ao longo do dia">
        <path class="native-line-grid" d="M ${padding} ${height - padding} H ${width - padding}" />
        <path class="native-line-path" d="${path}" style="--color:${color}" />
        ${points.map((point) => `
          <g data-chart-tooltip="${escapeHtml(tooltipText(point[labelKey], [`Quantidade: ${formatValue(point[valueKey], unit)}`]))}">
            <circle cx="${point.x}" cy="${point.y}" r="4" fill="${color}"></circle>
            <text x="${point.x}" y="${point.y - 10}" text-anchor="middle">${formatValue(point[valueKey], unit)}</text>
          </g>
        `).join("")}
      </svg>
      <div class="native-line-axis">
        ${points.map((point) => `<span>${escapeHtml(point[labelKey])}</span>`).join("")}
      </div>
    </div>
  `;
}

function dateLabel(dateISO) {
  const [year, month, day] = String(dateISO || "").split("-");
  if (!year || !month || !day) return dateISO || "Sem data";
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date).replace(".", "");
  return `${weekday} ${day}/${month}`;
}

function idleByEmployee(records) {
  return Array.from(groupBy(records.filter((record) => record.isIdle), "employee").entries())
    .map(([key, items]) => ({
      key,
      idleSeconds: items.reduce((sum, item) => sum + item.realSeconds, 0)
    }))
    .filter((item) => item.idleSeconds > 0)
    .sort(sortBy("idleSeconds"))
    .slice(0, 12);
}

function productionTrend(production) {
  const dates = [...new Set(production.map((record) => record.date).filter(Boolean))];
  const multiDay = dates.length > 1;
  const groupedRecords = production.map((record) => ({
    ...record,
    trendKey: multiDay ? record.date : `${secondsToClock(record.startSeconds).slice(0, 2)}:00`
  }));

  return Array.from(groupBy(groupedRecords, "trendKey").entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({
      key: multiDay ? dateLabel(key) : key,
      quantity: items.reduce((sum, item) => sum + item.quantity, 0)
    }));
}

function bindNativeChartClicks() {
  document.querySelectorAll("[data-chart-filter]").forEach((button) => {
    button.addEventListener("click", () => dispatchFilter(button.dataset.chartFilter, button.dataset.chartLabel));
  });
  bindChartTooltip();
}

function bindChartTooltip() {
  let tooltip = document.querySelector(".native-chart-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "native-chart-tooltip";
    document.body.appendChild(tooltip);
  }

  const moveTooltip = (event) => {
    const source = event.target.closest("[data-chart-tooltip]");
    if (!source) return;
    const [title, ...lines] = String(source.dataset.chartTooltip || "").split("||");
    tooltip.innerHTML = `<strong>${escapeHtml(title)}</strong>${lines.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}`;
    const rect = source.getBoundingClientRect();
    const pointerX = Number.isFinite(event.clientX) ? event.clientX : rect.left + rect.width / 2;
    const pointerY = Number.isFinite(event.clientY) ? event.clientY : rect.top + rect.height / 2;
    const x = Math.min(pointerX + 14, window.innerWidth - tooltip.offsetWidth - 14);
    const y = Math.min(pointerY + 14, window.innerHeight - tooltip.offsetHeight - 14);
    tooltip.style.left = `${Math.max(14, x)}px`;
    tooltip.style.top = `${Math.max(14, y)}px`;
    tooltip.classList.add("is-visible");
  };

  document.querySelectorAll("[data-chart-tooltip]").forEach((item) => {
    item.addEventListener("mousemove", moveTooltip);
    item.addEventListener("mouseleave", () => tooltip.classList.remove("is-visible"));
    item.addEventListener("focus", (event) => moveTooltip(event));
    item.addEventListener("blur", () => tooltip.classList.remove("is-visible"));
  });
}

export function renderCharts(records) {
  const production = records.filter((record) => !record.isIdle && !record.isBreak);
  const byEmployeeQuantity = aggregateBy(production, "employee").sort(sortBy("totalQuantity")).slice(0, 12);
  const byEmployeeHours = aggregateBy(production, "employee").sort(sortBy("realSeconds")).slice(0, 12);
  const byEmployeeEfficiency = aggregateBy(production, "employee").sort(sortBy("realSeconds")).slice(0, 12);
  const byEmployeeIdle = idleByEmployee(records);
  const byProductQuantity = aggregateBy(production, "product").sort(sortBy("totalQuantity")).slice(0, 12);
  const byProductHours = aggregateBy(production, "product").sort(sortBy("realSeconds")).slice(0, 12);
  const byShift = aggregateBy(production, "shift").sort((a, b) => String(a.key).localeCompare(String(b.key)));
  const byPeriod = productionTrend(production);

  const html = [
    barChart({
      rows: byEmployeeQuantity.map((x) => ({ key: x.key, quantity: x.totalQuantity })),
      valueKeys: ["quantity"],
      names: ["Quantidade"],
      colors: ["#0f5f8f"],
      filter: "employee"
    }),
    barChart({
      rows: byEmployeeHours.map((x) => ({ key: x.key, real: x.realSeconds, theory: x.theoreticalSeconds })),
      valueKeys: ["real", "theory"],
      names: ["Real", "Teórico"],
      colors: ["#1f77b4", "#64b5f6"],
      unit: "duration",
      filter: "employee"
    }),
    barChart({
      rows: byProductQuantity.map((x) => ({ key: x.key, quantity: x.totalQuantity })),
      valueKeys: ["quantity"],
      names: ["Quantidade"],
      colors: ["#00897b"],
      filter: "product"
    }),
    lineChart({
      rows: byPeriod,
      valueKey: "quantity",
      color: "#7b61ff"
    }),
    barChart({
      rows: byEmployeeEfficiency.map((x) => ({ key: x.key, efficiency: +x.efficiency.toFixed(1) })),
      valueKeys: ["efficiency"],
      names: ["Eficiência"],
      colors: ["#2e7d32"],
      unit: "percent",
      filter: "employee"
    }),
    barChart({
      rows: byEmployeeIdle,
      valueKeys: ["idleSeconds"],
      names: ["Ociosidade"],
      colors: ["#dc2626"],
      unit: "duration",
      filter: "employee"
    }),
    barChart({
      rows: byProductHours.map((x) => ({ key: x.key, real: x.realSeconds, theory: x.theoreticalSeconds })),
      valueKeys: ["real", "theory"],
      names: ["Real", "Teórico"],
      colors: ["#b23a48", "#f4a261"],
      unit: "duration",
      filter: "product"
    }),
    barChart({
      rows: byShift.map((x) => ({ key: x.key, quantity: x.totalQuantity })),
      valueKeys: ["quantity"],
      names: ["Quantidade"],
      colors: ["#3949ab"],
      filter: "shift"
    })
  ];

  html.forEach((content, index) => {
    const el = document.querySelector(`#chart-${index}`);
    if (el) el.innerHTML = content;
  });
  bindNativeChartClicks();
}
