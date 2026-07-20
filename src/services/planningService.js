import Papa from "papaparse";
import { rawRowsFromPapa } from "./dataParser.js";
import { getPlanningConnectionSettings } from "./settingsService.js";
import { parseDate, parseTime, secondsToDuration } from "../utils/dateUtils.js";

const text = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const normalize = (value) => text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const normalizeShift = (value) => {
  const raw = normalize(value);
  const match = raw.match(/[123]/);
  return match ? match[0] : text(value);
};

function csvUrl(spreadsheetId, sheetName, sheetGid) {
  const tab = sheetGid
    ? `gid=${encodeURIComponent(sheetGid)}`
    : `sheet=${encodeURIComponent(sheetName)}`;
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/gviz/tq?tqx=out:csv&${tab}`;
}

function readAny(row, keys) {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalize(key), value]));
  return keys.map((key) => normalized[normalize(key)]).find((value) => text(value)) ?? "";
}

function numberValue(value) {
  const parsed = Number(String(value ?? "").replace(/\./g, "").replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePlanRows(rows, type) {
  return rows
    .filter((row) => Object.values(row).some((value) => text(value)))
    .map((row, index) => {
      const date = parseDate(readAny(row, ["Data", "DATA"]));
      const item = readAny(row, type === "montagem" ? ["Produto", "Montagem", "Item"] : ["Produto", "Tipo / Palco", "Tipo", "Palco", "Item"]);
      const quantity = numberValue(readAny(row, ["Quantidade Planejada", "Qtd Planejada", "Quantidade", "Qtd"]));
      const theoreticalTotalSeconds = parseTime(readAny(row, ["Tempo Teorico Total", "Tempo Teórico Total", "Horas Planejadas", "Tempo"])) || 0;
      return {
        id: text(readAny(row, ["ID", "Id"])) || `${type}-${date || "sem-data"}-${index}`,
        type,
        sourceName: type === "montagem" ? "Plano Montagem" : "Plano Corte",
        date,
        shift: normalizeShift(readAny(row, ["Turno", "TURNO"])),
        machine: text(readAny(row, ["Maquina", "Máquina"])),
        item: normalize(item || (type === "montagem" ? "MONTAGEM" : "CORTE")),
        quantity,
        theoreticalTotalSeconds,
        observation: text(readAny(row, ["Observacao", "Observação", "Descricao", "Descrição"])),
        createdAt: text(readAny(row, ["Criado em", "Criado Em"])),
        updatedAt: text(readAny(row, ["Atualizado em", "Atualizado Em"]))
      };
    })
    .filter((plan) => plan.date && plan.item);
}

async function fetchPlanSheet(connection, type) {
  if (!connection.spreadsheetId) return [];
  const sheetName = type === "montagem" ? connection.montagemSheetName : connection.corteSheetName;
  const sheetGid = type === "montagem" ? connection.montagemSheetGid : connection.corteSheetGid;
  const response = await fetch(csvUrl(connection.spreadsheetId, sheetName, sheetGid), { cache: "no-store" });
  if (!response.ok) throw new Error(`Plano ${type}: falha ao carregar (${response.status})`);
  const csv = await response.text();
  if (/^\s*</.test(csv)) throw new Error(`Plano ${type}: a planilha retornou login em vez de CSV`);
  const parsed = Papa.parse(csv, { header: false, skipEmptyLines: false });
  if (parsed.errors.length) throw new Error(parsed.errors[0].message);
  return normalizePlanRows(rawRowsFromPapa(parsed), type);
}

export async function loadPlanningDataset() {
  const connection = getPlanningConnectionSettings();
  if (!connection.spreadsheetId) {
    return { plans: [], warning: "Configure a planilha de planejamento para carregar o plano anual." };
  }
  const results = await Promise.allSettled([
    fetchPlanSheet(connection, "montagem"),
    fetchPlanSheet(connection, "corte")
  ]);
  const plans = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const issues = results
    .map((result) => result.status === "rejected" ? result.reason?.message : "")
    .filter(Boolean);
  return {
    plans,
    warning: issues.length ? `Plano parcialmente carregado: ${issues.join(" | ")}` : ""
  };
}

export async function savePlanRecord(record) {
  return savePlanRecords([record]).then((records) => records[0]);
}

export async function savePlanRecords(records) {
  const connection = getPlanningConnectionSettings();
  if (!connection.scriptUrl) {
    throw new Error("Configure a URL do Apps Script em Configuracoes para salvar no Google Sheets.");
  }

  const createdAt = Date.now();
  const payloadRecords = records.map((record, index) => ({
    action: "upsert",
    id: record.id || `${record.type}-${createdAt}-${index + 1}`,
    spreadsheetId: connection.spreadsheetId,
    tipoBase: record.type,
    data: record.date,
    turno: record.shift,
    maquina: record.machine || "",
    item: record.item,
    quantidadePlanejada: record.quantity,
    tempoTeoricoTotal: secondsToDuration(
      typeof record.theoreticalTotalSeconds === "number"
        ? record.theoreticalTotalSeconds
        : parseTime(record.theoreticalTotalSeconds) || 0
    ),
    observacao: record.observation || ""
  }));

  for (const payload of payloadRecords) {
    await fetch(connection.scriptUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
  }

  return payloadRecords;
}
