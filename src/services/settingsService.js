import { CONFIG, WORK_SCHEDULE } from "../config.js";
import { parseTime, secondsToDuration } from "../utils/dateUtils.js";

const SETTINGS_KEY = "dashboard-montagem:operational-settings";

const DEFAULT_EMPLOYEE_SCHEDULES = [
  ["Samara", "14:00", "23:30"],
  ["Tamires", "14:00", "23:30"],
  ["Yara", "14:00", "23:30"],
  ["Nathasa", "14:00", "23:30"],
  ["GIOVANA CUNHA", "05:00", "14:30"],
  ["CAROLINE", "14:00", "23:30"],
  ["LEILSON", "05:00", "14:30"],
  ["MARIA EDUARDA", "05:00", "14:30"],
  ["GABRIEL C", "05:00", "14:30"],
  ["Rafael", "05:00", "14:30"],
  ["Giovana Oliveira", "05:00", "14:30"],
  ["Marcos Aurélio", "05:00", "14:30"],
  ["João Avelino", "21:00", "05:30"],
  ["Carlos", "21:00", "05:30"],
  ["ANDREI", "14:00", "23:30"],
  ["Yasmin", "14:00", "23:30"],
  ["Gustavo", "14:00", "23:30"],
  ["Raissa", "05:00", "14:30"],
  ["MARCOS DANIEL", "21:00", "05:30"],
  ["Robson", "07:30", "17:00"]
].map(([employee, start, end]) => ({
  employee,
  workType: "Montagem",
  shift: "",
  start,
  end,
  breakStart: "",
  breakEnd: ""
}));

const clean = (value) => String(value ?? "").trim();
const normalize = (value) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const isMissingSpreadsheet = (value) => !clean(value) || clean(value).includes("INSERIR");
const refreshIntervalValue = (value) => value === 0 || value ? Number(value) : CONFIG.refreshInterval;

function employeeNameMatches(configuredName, actualName) {
  const configured = normalize(configuredName);
  const actual = normalize(actualName);
  return configured === actual || configured.startsWith(actual) || actual.startsWith(configured);
}

function normalizeSchedule(item) {
  return {
    employee: clean(item.employee),
    workType: ["Produção", "Montagem"].includes(clean(item.workType)) ? clean(item.workType) : "Montagem",
    shift: clean(item.shift),
    start: clean(item.start),
    end: clean(item.end),
    breakStart: clean(item.breakStart),
    breakEnd: clean(item.breakEnd)
  };
}

function mergeDefaultEmployeeSchedules(savedSchedules = []) {
  const saved = savedSchedules.map(normalizeSchedule).filter((item) => item.employee && item.start && item.end);
  const defaultsWithOverrides = DEFAULT_EMPLOYEE_SCHEDULES.map((defaultItem) => {
    const override = saved.find((item) => employeeNameMatches(defaultItem.employee, item.employee));
    return override ? { ...defaultItem, ...override } : { ...defaultItem };
  });
  const additionalSaved = saved.filter((item) => !DEFAULT_EMPLOYEE_SCHEDULES.some((defaultItem) => employeeNameMatches(defaultItem.employee, item.employee)));
  return [...defaultsWithOverrides, ...additionalSaved];
}

function defaultConnection(parsed = {}) {
  const extracted = extractSpreadsheetInfo(parsed.spreadsheetId || CONFIG.spreadsheetId);
  return {
    dataSource: "google-sheets",
    spreadsheetId: isMissingSpreadsheet(extracted.spreadsheetId) ? CONFIG.spreadsheetId : extracted.spreadsheetId,
    sheetName: clean(parsed.sheetName || CONFIG.sheetName) || "DB",
    sheetGid: clean(parsed.sheetGid || extracted.sheetGid || CONFIG.sheetGid),
    refreshInterval: refreshIntervalValue(parsed.refreshInterval)
  };
}

function defaultSecondaryConnection(parsed = {}) {
  const extracted = extractSpreadsheetInfo(parsed.spreadsheetId || CONFIG.secondarySpreadsheetId);
  return {
    dataSource: "google-sheets",
    spreadsheetId: isMissingSpreadsheet(extracted.spreadsheetId) ? CONFIG.secondarySpreadsheetId : extracted.spreadsheetId,
    sheetName: clean(parsed.sheetName || CONFIG.secondarySheetName) || "DB",
    sheetGid: clean(parsed.sheetGid || extracted.sheetGid || CONFIG.secondarySheetGid),
    refreshInterval: refreshIntervalValue(parsed.refreshInterval)
  };
}

function defaultPlanningConnection(parsed = {}) {
  const extracted = extractSpreadsheetInfo(parsed.spreadsheetId || "");
  return {
    dataSource: "google-sheets",
    spreadsheetId: extracted.spreadsheetId || "",
    montagemSheetName: clean(parsed.montagemSheetName || "PLANO_MONTAGEM") || "PLANO_MONTAGEM",
    montagemSheetGid: clean(parsed.montagemSheetGid || extracted.sheetGid),
    corteSheetName: clean(parsed.corteSheetName || "PLANO_CORTE") || "PLANO_CORTE",
    corteSheetGid: clean(parsed.corteSheetGid),
    scriptUrl: clean(parsed.scriptUrl),
    cuttingMachines: Number(parsed.cuttingMachines || 14)
  };
}

export function loadOperationalSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      dataConnection: defaultConnection(parsed.dataConnection),
      secondaryDataConnection: defaultSecondaryConnection(parsed.secondaryDataConnection),
      planningConnection: defaultPlanningConnection(parsed.planningConnection),
      employeeSchedules: mergeDefaultEmployeeSchedules(Array.isArray(parsed.employeeSchedules) ? parsed.employeeSchedules : []),
      theoreticalTimes: Array.isArray(parsed.theoreticalTimes) ? parsed.theoreticalTimes : []
    };
  } catch {
    return {
      dataConnection: {
        dataSource: "google-sheets",
        spreadsheetId: CONFIG.spreadsheetId,
        sheetName: CONFIG.sheetName,
        sheetGid: CONFIG.sheetGid,
        refreshInterval: CONFIG.refreshInterval
      },
      secondaryDataConnection: {
        dataSource: "google-sheets",
        spreadsheetId: CONFIG.secondarySpreadsheetId,
        sheetName: CONFIG.secondarySheetName,
        sheetGid: CONFIG.secondarySheetGid,
        refreshInterval: CONFIG.refreshInterval
      },
      planningConnection: defaultPlanningConnection(),
      employeeSchedules: mergeDefaultEmployeeSchedules(),
      theoreticalTimes: []
    };
  }
}

export function saveOperationalSettings(settings) {
  const parsedConnection = extractSpreadsheetInfo(settings.dataConnection?.spreadsheetId || "");
  const parsedSecondaryConnection = extractSpreadsheetInfo(settings.secondaryDataConnection?.spreadsheetId || "");
  const parsedPlanningConnection = extractSpreadsheetInfo(settings.planningConnection?.spreadsheetId || "");
  const normalized = {
    dataConnection: {
      dataSource: "google-sheets",
      spreadsheetId: parsedConnection.spreadsheetId || CONFIG.spreadsheetId,
      sheetName: clean(settings.dataConnection?.sheetName || CONFIG.sheetName) || "DB",
      sheetGid: clean(settings.dataConnection?.sheetGid || parsedConnection.sheetGid || CONFIG.sheetGid),
      refreshInterval: refreshIntervalValue(settings.dataConnection?.refreshInterval)
    },
    secondaryDataConnection: {
      dataSource: "google-sheets",
      spreadsheetId: parsedSecondaryConnection.spreadsheetId || CONFIG.secondarySpreadsheetId,
      sheetName: clean(settings.secondaryDataConnection?.sheetName || CONFIG.secondarySheetName) || "DB",
      sheetGid: clean(settings.secondaryDataConnection?.sheetGid || parsedSecondaryConnection.sheetGid || CONFIG.secondarySheetGid),
      refreshInterval: refreshIntervalValue(settings.dataConnection?.refreshInterval)
    },
    planningConnection: {
      dataSource: "google-sheets",
      spreadsheetId: parsedPlanningConnection.spreadsheetId,
      montagemSheetName: clean(settings.planningConnection?.montagemSheetName || "PLANO_MONTAGEM") || "PLANO_MONTAGEM",
      montagemSheetGid: clean(settings.planningConnection?.montagemSheetGid || parsedPlanningConnection.sheetGid),
      corteSheetName: clean(settings.planningConnection?.corteSheetName || "PLANO_CORTE") || "PLANO_CORTE",
      corteSheetGid: clean(settings.planningConnection?.corteSheetGid),
      scriptUrl: clean(settings.planningConnection?.scriptUrl),
      cuttingMachines: Number(settings.planningConnection?.cuttingMachines || 14)
    },
    employeeSchedules: (settings.employeeSchedules || []).map(normalizeSchedule).filter((item) => item.employee && item.start && item.end),
    theoreticalTimes: (settings.theoreticalTimes || [])
      .map((item) => ({
        product: clean(item.product).toUpperCase(),
        theoreticalUnitTime: clean(item.theoreticalUnitTime)
      }))
      .filter((item) => item.product && parseTime(item.theoreticalUnitTime))
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
}

export function clearOperationalSettings() {
  localStorage.removeItem(SETTINGS_KEY);
}

export function findEmployeeSchedule(schedules, employee) {
  return schedules.find((item) => employeeNameMatches(item.employee, employee));
}

export function getEmployeeSchedule(employee, shift) {
  const settings = loadOperationalSettings();
  const match = findEmployeeSchedule(settings.employeeSchedules, employee);
  if (match) {
    const breaks = match.breakStart && match.breakEnd ? [{ label: "Pausa", start: match.breakStart, end: match.breakEnd }] : [];
    return {
      key: `employee-${normalize(employee)}`,
      label: match.employee,
      workType: match.workType || "Montagem",
      start: match.start,
      end: match.end,
      breaks,
      shift: match.shift || shift
    };
  }

  const key = Object.keys(WORK_SCHEDULE).find((item) => {
    const schedule = WORK_SCHEDULE[item];
    return shift === item || shift === schedule.label || String(shift || "").toLowerCase().includes(item.replace("turno", ""));
  }) || "turno1";
  return { key, workType: "Montagem", ...WORK_SCHEDULE[key] };
}

export function getConfiguredTheoreticalUnit(product) {
  const settings = loadOperationalSettings();
  const match = settings.theoreticalTimes.find((item) => normalize(item.product) === normalize(product));
  return match ? parseTime(match.theoreticalUnitTime) : 0;
}

export function getDataConnectionSettings() {
  return loadOperationalSettings().dataConnection;
}

export function getSecondaryDataConnectionSettings() {
  return loadOperationalSettings().secondaryDataConnection;
}

export function getPlanningConnectionSettings() {
  return loadOperationalSettings().planningConnection;
}

export function extractSpreadsheetId(value) {
  return extractSpreadsheetInfo(value).spreadsheetId;
}

export function extractSpreadsheetInfo(value) {
  const raw = clean(value);
  const idMatch = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = raw.match(/[?#&]gid=([0-9]+)/);
  return {
    spreadsheetId: idMatch ? idMatch[1] : raw,
    sheetGid: gidMatch ? gidMatch[1] : ""
  };
}

export function formatSettingTime(value) {
  if (!value) return "";
  const seconds = parseTime(value);
  return seconds ? secondsToDuration(seconds) : "";
}
