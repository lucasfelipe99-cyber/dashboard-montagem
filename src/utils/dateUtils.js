export function pad(value) {
  return String(value).padStart(2, "0");
}

export function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDaysISO(dateISO, days) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateToDayStartSeconds(dateISO) {
  if (!dateISO) return 0;
  const [y, m, d] = dateISO.split("-").map(Number);
  return Math.floor(new Date(y, m - 1, d).getTime() / 1000);
}

export function dateAndSecondsToDate(dateISO, seconds) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setSeconds(seconds || 0);
  return date;
}

export function absoluteSecondsToDate(seconds) {
  return new Date(seconds * 1000);
}

export function dateTimeLabel(absoluteSeconds) {
  const date = new Date(absoluteSeconds * 1000);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseDate(value) {
  if (!value) return "";
  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (match) {
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    return `${year}-${pad(match[2])}-${pad(match[1])}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return "";
}

export function parseTime(value) {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim().replace(",", ".");
  const match = raw.match(/(\d{1,3}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0);
  }
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return numeric < 1 ? Math.round(numeric * 86400) : Math.round(numeric * 60);
  return null;
}

export function secondsToDuration(seconds) {
  if (!Number.isFinite(seconds)) return "00:00:00";
  const sign = seconds < 0 ? "-" : "";
  const total = Math.abs(Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${sign}${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function durationToSeconds(value) {
  if (typeof value === "number") return value;
  return parseTime(value);
}

export function calculateDuration(startSeconds, endSeconds, nowSeconds = null) {
  if (!Number.isFinite(startSeconds)) return 0;
  const end = Number.isFinite(endSeconds) ? endSeconds : nowSeconds;
  if (!Number.isFinite(end)) return 0;
  return end < startSeconds ? end + 86400 - startSeconds : end - startSeconds;
}

export function secondsToClock(seconds) {
  if (!Number.isFinite(seconds)) return "";
  const normalized = ((Math.round(seconds) % 86400) + 86400) % 86400;
  return `${pad(Math.floor(normalized / 3600))}:${pad(Math.floor((normalized % 3600) / 60))}`;
}

export function nowSecondsOfDay() {
  const now = new Date();
  return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
}
