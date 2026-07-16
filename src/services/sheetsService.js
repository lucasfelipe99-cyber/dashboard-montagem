import Papa from "papaparse";
import { normalizeRecords, rawRowsFromPapa } from "./dataParser.js";
import { getDataConnectionSettings, getSecondaryDataConnectionSettings } from "./settingsService.js";

export function csvUrl(connection, preferGid = false) {
  const id = encodeURIComponent(connection.spreadsheetId);
  const tab = preferGid && connection.sheetGid
    ? `gid=${encodeURIComponent(connection.sheetGid)}`
    : connection.sheetName
    ? `sheet=${encodeURIComponent(connection.sheetName)}`
    : `gid=${encodeURIComponent(connection.sheetGid)}`;
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&${tab}`;
}

async function fetchCsv(connection, preferGid = false) {
  try {
    const response = await fetch(csvUrl(connection, preferGid), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`acesso negado pelo Google Sheets (${response.status})`);
    }
    return response.text();
  } catch (error) {
    const detail = error?.message || "falha de rede";
    throw new Error(`${detail}. A base ${connection.sourceName || "Google Sheets"} precisa estar compartilhada como "qualquer pessoa com o link pode ver" ou publicada na Web como CSV.`);
  }
}

async function fetchGoogleSheetRows(connection) {
  if (!connection.spreadsheetId || connection.spreadsheetId.includes("INSERIR")) {
    throw new Error("Informe o ID ou URL da planilha na aba Configuracoes.");
  }

  const attempts = connection.sheetName && connection.sheetGid ? [false, true] : [false];
  let csv = "";
  let lastError;
  for (const preferGid of attempts) {
    try {
      csv = await fetchCsv(connection, preferGid);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!csv) {
    throw lastError;
  }

  if (/^\s*</.test(csv)) {
    throw new Error(`A base ${connection.sourceName || "Google Sheets"} retornou uma pagina de login em vez de CSV. Compartilhe a planilha publicamente ou publique a aba na Web.`);
  }

  const parsed = Papa.parse(csv, { header: false, skipEmptyLines: false });
  if (parsed.errors.length) throw new Error(parsed.errors[0].message);

  return rawRowsFromPapa(parsed).map((row) => ({
    ...row,
    __sourceId: connection.spreadsheetId,
    __sourceName: connection.sourceName,
    __sourceType: connection.sourceType
  }));
}

function secondaryConnection() {
  const connection = getSecondaryDataConnectionSettings();
  return {
    ...connection,
    sourceName: "Corte",
    sourceType: "corte"
  };
}

export async function loadDataset() {
  const connection = getDataConnectionSettings();
  const primary = {
    ...connection,
    sourceName: "Montagem",
    sourceType: "montagem"
  };
  const sources = [primary, secondaryConnection()];
  const results = await Promise.allSettled(sources.map(fetchGoogleSheetRows));
  const loadedSources = [];
  const accessIssues = [];
  const rawRows = results.flatMap((result, index) => {
    const source = sources[index];
    if (result.status === "fulfilled") {
      loadedSources.push(source);
      return result.value;
    }
    accessIssues.push(`${source.sourceName}: ${result.reason?.message || "falha ao carregar"}`);
    return [];
  });

  if (!rawRows.length) {
    throw new Error(accessIssues.join(" | ") || "Nenhuma base real foi carregada.");
  }

  const records = normalizeRecords(rawRows);

  return {
    rawRows,
    records,
    source: "google-sheets",
    connection,
    sources,
    loadedSources,
    accessIssues,
    warning: accessIssues.length ? `Algumas bases nao foram carregadas: ${accessIssues.join(" | ")}` : "",
    loadedAt: new Date().toISOString()
  };
}
