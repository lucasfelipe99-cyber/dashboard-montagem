import { PERFORMANCE_LIMITS, STATUS, WORK_SCHEDULE } from "../config.js";
import { calculateDuration, parseTime } from "./dateUtils.js";
import { getEmployeeSchedule } from "../services/settingsService.js";

export function safeDivide(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

export function calculateEfficiency(theoreticalSeconds, realSeconds) {
  return safeDivide(theoreticalSeconds, realSeconds) * 100;
}

export function calculateProductivity(quantity, realSeconds) {
  return safeDivide(quantity, realSeconds / 3600);
}

export function getPerformanceStatus(record) {
  if (record.invalid) return STATUS.invalid;
  if (record.overlap) return STATUS.overlap;
  if (record.isIdle) return STATUS.idle;
  if (record.isBreak) return STATUS.break;
  if (record.isRunning) return STATUS.running;
  if (!record.theoreticalTotalSeconds) return STATUS.noTheory;
  const ratio = record.realSeconds / record.theoreticalTotalSeconds;
  if (ratio <= PERFORMANCE_LIMITS.onTarget) return STATUS.onTarget;
  if (ratio <= PERFORMANCE_LIMITS.warning) return STATUS.warning;
  return STATUS.critical;
}

export function scheduleSeconds(shift, employee = "") {
  const schedule = employee ? getEmployeeSchedule(employee, shift) : null;
  const key = schedule?.key || Object.keys(WORK_SCHEDULE).find((item) => {
    const s = WORK_SCHEDULE[item];
    return shift === item || shift === s.label || String(shift || "").toLowerCase().includes(item.replace("turno", ""));
  }) || "turno1";
  const resolvedSchedule = schedule || WORK_SCHEDULE[key];
  const start = parseTime(resolvedSchedule.start);
  const end = parseTime(resolvedSchedule.end);
  const duration = calculateDuration(start, end);
  const breaks = (resolvedSchedule.breaks || []).reduce((sum, item) => sum + calculateDuration(parseTime(item.start), parseTime(item.end)), 0);
  return { key, schedule: resolvedSchedule, start, end, availableSeconds: Math.max(duration - breaks, 0), breaks };
}

export function calculateIdleTime(employeeRecords) {
  return employeeRecords.filter((record) => record.isIdle).reduce((sum, record) => sum + record.realSeconds, 0);
}

export function summarize(records) {
  const production = records.filter((record) => !record.isIdle && !record.isBreak);
  const realSeconds = production.reduce((sum, record) => sum + record.realSeconds, 0);
  const theoreticalSeconds = production.reduce((sum, record) => sum + record.theoreticalTotalSeconds, 0);
  const quantity = production.reduce((sum, record) => sum + record.quantity, 0);
  const employees = new Set(production.map((record) => record.employee).filter(Boolean));
  const products = new Set(production.map((record) => record.product).filter(Boolean));
  const idleSeconds = records.filter((record) => record.isIdle).reduce((sum, record) => sum + record.realSeconds, 0);
  const available = Array.from(groupBy(records, "employee").values()).reduce((sum, items) => sum + Math.max(...items.map((item) => scheduleSeconds(item.shift, item.employee).availableSeconds), 0), 0);
  return {
    production,
    totalQuantity: quantity,
    employees: employees.size,
    products: products.size,
    realSeconds,
    theoreticalSeconds,
    efficiency: calculateEfficiency(theoreticalSeconds, realSeconds),
    productivity: calculateProductivity(quantity, realSeconds),
    idleSeconds,
    occupation: safeDivide(realSeconds, available) * 100,
    done: production.filter((record) => !record.isRunning).length,
    running: production.filter((record) => record.isRunning).length,
    variance: realSeconds - theoreticalSeconds
  };
}

export function groupBy(records, field) {
  const map = new Map();
  records.forEach((record) => {
    const key = record[field] || "Sem informação";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(record);
  });
  return map;
}

export function aggregateBy(records, field) {
  return Array.from(groupBy(records, field).entries()).map(([key, items]) => {
    const stats = summarize(items);
    return { key, items, ...stats };
  });
}
