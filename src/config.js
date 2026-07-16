export const CONFIG = {
  spreadsheetId: import.meta.env.VITE_SPREADSHEET_ID || "1UdR9VGisFlLRkBDZdVGzHqoo3LLEFvegR9ZI6Om6tSE",
  sheetName: import.meta.env.VITE_SHEET_NAME || "DB",
  sheetGid: import.meta.env.VITE_SHEET_GID || "1017368919",
  secondarySpreadsheetId: import.meta.env.VITE_SECONDARY_SPREADSHEET_ID || "1FrP-podqNheagKGK54EwmeKUVjkZ-ZP2ZYTWJJTcw9A",
  secondarySheetName: import.meta.env.VITE_SECONDARY_SHEET_NAME || "DB",
  secondarySheetGid: import.meta.env.VITE_SECONDARY_SHEET_GID || "809312188",
  refreshInterval: Number(import.meta.env.VITE_REFRESH_INTERVAL || 0),
  timezone: "America/Sao_Paulo"
};

export const COLUMN_MAP = {
  timestamp: "Carimbo de data/hora",
  shift: "TURNO",
  employee: "MONTADORES",
  product: "MONTAGEM",
  productColumnIndex: 3,
  secondaryAssemblyColumnIndex: 7,
  startTime: "Horario Inicio Da Montagem",
  endTime: "Horario Final da Montagem",
  quantity: "Quantidade",
  duration: "Duração",
  date: "Data",
  theoreticalUnitTime: "Tempo Teório Unitario",
  theoreticalTotalTime: "Tempo Teórico Total",
  actualUnitTime: "Unitario"
};

export const WORK_SCHEDULE = {
  turno1: { label: "1º Turno", start: "05:00", end: "14:00", breaks: [] },
  turno2: { label: "2º Turno", start: "14:00", end: "23:30", breaks: [] },
  turno3: { label: "3º Turno", start: "21:00", end: "05:20", breaks: [] }
};

export const PERFORMANCE_LIMITS = {
  onTarget: 1,
  warning: 1.15,
  critical: 1.3
};

export const STATUS = {
  running: "Em andamento",
  done: "Concluída",
  onTarget: "Dentro do planejado",
  warning: "Acima do planejado",
  critical: "Muito acima do planejado",
  noTheory: "Sem tempo teórico",
  invalid: "Registro inconsistente",
  overlap: "Sobreposição de horário",
  idle: "Ociosidade",
  break: "Pausa programada"
};
