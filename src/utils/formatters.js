import { secondsToDuration } from "./dateUtils.js";

export const number = (value, decimals = 0) => new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: decimals,
  minimumFractionDigits: decimals
}).format(Number.isFinite(value) ? value : 0);

export const percent = (value) => `${number(value, 1)}%`;

export const hours = (seconds) => secondsToDuration(seconds);

export const compact = (value) => new Intl.NumberFormat("pt-BR", { notation: "compact" }).format(value || 0);
