const SHEETS = {
  montagem: "PLANO_MONTAGEM",
  corte: "PLANO_CORTE"
};

const PLANNING_SPREADSHEET_ID = "1GQbKNCrnsjd7ytOMIPhQq1e7lg6j_-2LdEpmgZ22z8w";

const HEADERS = [
  "ID",
  "Data",
  "Turno",
  "Produto",
  "Quantidade Planejada",
  "Tempo Teorico Total",
  "Observacao",
  "Criado em",
  "Atualizado em",
  "Maquina"
];

function doPost(event) {
  const payload = JSON.parse(event.postData.contents || "{}");
  const records = Array.isArray(payload.records) ? payload.records : [payload];
  const saved = records
    .filter((record) => record && record.tipoBase)
    .map((record) => saveRecord_(record));

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, count: saved.length, ids: saved }))
    .setMimeType(ContentService.MimeType.JSON);
}

function saveRecord_(payload) {
  const sheetName = SHEETS[payload.tipoBase] || SHEETS.montagem;
  const sheet = getOrCreateSheet_(sheetName, payload.spreadsheetId);
  ensureHeaders_(sheet);

  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
  const id = payload.id || `${payload.tipoBase}-${Date.now()}`;
  const values = [
    id,
    payload.data || "",
    payload.turno || "",
    payload.item || "",
    payload.quantidadePlanejada || 0,
    payload.tempoTeoricoTotal || "00:00:00",
    payload.observacao || "",
    now,
    now,
    payload.maquina || ""
  ];

  const rowIndex = findRowById_(sheet, id);
  if (rowIndex > 0) {
    values[7] = sheet.getRange(rowIndex, 8).getValue() || now;
    sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([values]);
  } else {
    sheet.appendRow(values);
  }

  return id;
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: "dashboard-planejamento", spreadsheetId: PLANNING_SPREADSHEET_ID }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet_(name, spreadsheetId) {
  const targetId = spreadsheetId || PLANNING_SPREADSHEET_ID;
  const spreadsheet = SpreadsheetApp.openById(targetId);
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function ensureHeaders_(sheet) {
  const current = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const needsHeader = HEADERS.some((header, index) => current[index] !== header);
  if (needsHeader) sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
}

function findRowById_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  const index = ids.findIndex((value) => String(value) === String(id));
  return index >= 0 ? index + 2 : -1;
}
