import { COLUMN_MAP, STATUS } from "../config.js";
import { calculateDuration, dateToDayStartSeconds, nowSecondsOfDay, parseDate, parseTime } from "../utils/dateUtils.js";
import { getPerformanceStatus, scheduleSeconds } from "../utils/calculations.js";
import { detectOverlap, fingerprint } from "../utils/validations.js";
import { getConfiguredTheoreticalUnit, getEmployeeSchedule } from "./settingsService.js";

const text = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const numberValue = (value) => {
  const normalized = String(value ?? "").replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function normalizeEmployeeName(value) {
  return text(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function normalizeProductName(value) {
  return text(value).toUpperCase();
}

function read(row, key) {
  const mapped = COLUMN_MAP[key];
  return row[mapped] ?? row[`${mapped}__2`] ?? "";
}

function readAny(row, keys) {
  return keys.map((key) => row[key] ?? row[`${key}__2`] ?? "").find((value) => text(value)) ?? "";
}

function compactJoin(values, separator = " - ") {
  return values.map(text).filter(Boolean).join(separator);
}

function theoreticalTotal(row, quantity, product) {
  const configuredUnit = getConfiguredTheoreticalUnit(product);
  if (configuredUnit) return configuredUnit * quantity;
  const fromBase = parseTime(read(row, "theoreticalTotalTime"));
  if (fromBase) return fromBase;
  const unit = parseTime(read(row, "theoreticalUnitTime"));
  return unit ? unit * quantity : 0;
}

export function normalizeRecords(rows) {
  const now = nowSecondsOfDay();
  const compactRows = rows.filter((row) => Object.values(row).some((value) => text(value)));
  const seen = new Map();
  const records = compactRows.map((row, index) => {
    if (row.__sourceType === "corte") return normalizeCorteRecord(row, index);
    const date = parseDate(read(row, "date") || read(row, "timestamp"));
    const employee = normalizeEmployeeName(read(row, "employee"));
    const product = normalizeProductName(read(row, "product"));
    const quantity = numberValue(read(row, "quantity"));
    const startSeconds = parseTime(read(row, "startTime"));
    const endSeconds = parseTime(read(row, "endTime"));
    const isRunning = !Number.isFinite(endSeconds);
    const realSeconds = calculateDuration(startSeconds, endSeconds, isRunning ? now : null);
    const configuredUnit = getConfiguredTheoreticalUnit(product);
    const theoreticalUnitSeconds = configuredUnit || parseTime(read(row, "theoreticalUnitTime")) || 0;
    const theoreticalTotalSeconds = theoreticalTotal(row, quantity, product);
    const dayStartSeconds = dateToDayStartSeconds(date);
    const absoluteStart = dayStartSeconds + (startSeconds || 0);
    const absoluteEnd = absoluteStart + realSeconds;
    const invalid = !date || !employee || !product || !quantity || !Number.isFinite(startSeconds) || realSeconds <= 0 || (Number.isFinite(endSeconds) && endSeconds < startSeconds && realSeconds > 16 * 3600);
    const record = {
      id: `r-${index}`,
      raw: row,
      sourceName: row.__sourceName || "Montagem",
      sourceType: row.__sourceType || "montagem",
      date,
      shift: text(read(row, "shift")),
      employee,
      product,
      startSeconds,
      endSeconds,
      realSeconds,
      theoreticalUnitSeconds,
      theoreticalTotalSeconds,
      actualUnitSeconds: parseTime(read(row, "actualUnitTime")) || 0,
      quantity,
      isRunning,
      invalid,
      overlap: false,
      isIdle: false,
      isBreak: false,
      absoluteStart,
      absoluteEnd
    };
    const key = fingerprint(record);
    record.duplicate = seen.has(key);
    seen.set(key, true);
    return record;
  });

  const byEmployeeDate = group(records);
  byEmployeeDate.forEach((items) => detectOverlap(items).forEach((id) => {
    const record = records.find((item) => item.id === id);
    if (record) record.overlap = true;
  }));

  return insertIdleBlocks(records).map((record) => ({ ...record, status: getPerformanceStatus(record) }));
}

function normalizeCorteRecord(row, index) {
  const date = parseDate(readAny(row, ["Data-", "Data", "Carimbo de data/hora"]));
  const employee = normalizeEmployeeName(readAny(row, ["OPERADOR?-", "OPERADOR?", "Operador", "OPERADOR"]));
  const shift = text(readAny(row, ["TURNO-", "TURNO", "Turno"]));
  const type = text(readAny(row, ["TIPO-", "TIPO", "Tipo"]));
  const machine = text(readAny(row, ["Maquina", "Máquina", "-Maquina", "-Máquina"]));
  const stageOrStop = text(readAny(row, ["Palco ou Tipo de Parada-", "Palco ou Tipo de Parada", "-Palco ou Tipo de Parada-"]));
  const stage = text(readAny(row, ["Palco-", "Palco"]));
  const input = text(readAny(row, ["Insumos-", "Insumos"]));
  const product = normalizeProductName(compactJoin([type, machine, stageOrStop, stage, input]) || "CORTE");
  const quantity = numberValue(readAny(row, ["NUMERO 1-", "NUMERO 1", "Número 1", "Quantidade"]));
  const startSeconds = parseTime(readAny(row, ["Horario Inicio Corte-", "Horario Inicio Corte", "Horário Inicio Corte", "Horário Início Corte"]));
  const durationSeconds = parseTime(readAny(row, ["Tempo Real-", "Tempo Real"]));
  const rawEndSeconds = parseTime(readAny(row, ["Hora-", "Hora"]));
  const endSeconds = Number.isFinite(rawEndSeconds)
    ? rawEndSeconds
    : Number.isFinite(startSeconds) && Number.isFinite(durationSeconds)
      ? startSeconds + durationSeconds
      : null;
  const realSeconds = Number.isFinite(durationSeconds)
    ? durationSeconds
    : calculateDuration(startSeconds, endSeconds, null);
  const theoreticalTotalSeconds = parseTime(readAny(row, ["Tempo Teórico-", "Tempo Teórico", "Tempo Teorico-", "Tempo Teorico"])) || 0;
  const theoreticalUnitSeconds = quantity ? theoreticalTotalSeconds / quantity : theoreticalTotalSeconds;
  const dayStartSeconds = dateToDayStartSeconds(date);
  const absoluteStart = dayStartSeconds + (startSeconds || 0);
  const absoluteEnd = absoluteStart + realSeconds;
  const invalid = !date || !employee || !product || !Number.isFinite(startSeconds) || realSeconds <= 0;

  return {
    id: `corte-${index}`,
    raw: row,
    sourceName: row.__sourceName || "Corte",
    sourceType: row.__sourceType || "corte",
    date,
    shift,
    employee,
    machine,
    product,
    startSeconds,
    endSeconds,
    realSeconds,
    theoreticalUnitSeconds,
    theoreticalTotalSeconds,
    actualUnitSeconds: quantity ? realSeconds / quantity : 0,
    quantity,
    isRunning: false,
    invalid,
    overlap: false,
    isIdle: false,
    isBreak: false,
    absoluteStart,
    absoluteEnd
  };
}

function group(records) {
  const map = new Map();
  records.forEach((record) => {
    const key = `${record.date}|${record.employee}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(record);
  });
  return map;
}

function workWindowFor(record) {
  const schedule = getEmployeeSchedule(record.employee, record.shift);
  const start = parseTime(schedule.start);
  const end = parseTime(schedule.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  const dayStart = dateToDayStartSeconds(record.date);
  let windowStart = dayStart + start;
  let windowEnd = dayStart + end;
  if (end <= start) {
    windowEnd += 86400;
    if (record.absoluteStart < windowStart) {
      windowStart -= 86400;
      windowEnd -= 86400;
    }
  }
  return { start: windowStart, end: windowEnd };
}

export function insertIdleBlocks(records) {
  const output = [...records];
  group(records).forEach((items, key) => {
    const sorted = items.filter((record) => !record.invalid).sort((a, b) => a.absoluteStart - b.absoluteStart);
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      const gap = current.absoluteStart - previous.absoluteEnd;
      if (gap > 60) {
        const { availableSeconds } = scheduleSeconds(current.shift, current.employee);
        const window = workWindowFor(current);
        const idleStart = window ? Math.max(previous.absoluteEnd, window.start) : previous.absoluteEnd;
        const idleEnd = window ? Math.min(current.absoluteStart, window.end) : current.absoluteStart;
        const idleSeconds = idleEnd - idleStart;
        if (availableSeconds > 0 && idleSeconds > 60) {
          const idleDayStart = dateToDayStartSeconds(current.date);
          output.push({
            id: `idle-${key}-${i}`,
            date: current.date,
            shift: current.shift,
            employee: current.employee,
            product: "OCIOSIDADE",
            startSeconds: idleStart - idleDayStart,
            endSeconds: idleEnd - idleDayStart,
            realSeconds: idleSeconds,
            theoreticalUnitSeconds: 0,
            theoreticalTotalSeconds: 0,
            quantity: 0,
            isRunning: false,
            invalid: false,
            overlap: false,
            duplicate: false,
            isIdle: true,
            isBreak: false,
            absoluteStart: idleStart,
            absoluteEnd: idleEnd,
            status: STATUS.idle,
            raw: {}
          });
        }
      }
    }
  });
  return output;
}

export function rawRowsFromPapa(results) {
  const [headers = [], ...body] = results.data;
  const uniqueHeaders = headers.map((header, index) => {
    const base = text(header);
    const duplicateCount = headers.slice(0, index).filter((item) => text(item) === base).length;
    return duplicateCount ? `${base}__${duplicateCount + 1}` : base;
  });
  return body.map((line) => Object.fromEntries(uniqueHeaders.map((header, index) => [header, line[index] ?? ""])));
}
