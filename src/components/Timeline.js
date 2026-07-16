import { Timeline } from "vis-timeline/standalone";
import { DataSet } from "vis-data";
import { absoluteSecondsToDate, addDaysISO, dateAndSecondsToDate, dateTimeLabel, dateToDayStartSeconds, parseTime, secondsToClock, secondsToDuration } from "../utils/dateUtils.js";
import { scheduleSeconds } from "../utils/calculations.js";

let timeline;
let activeIdleRecord = null;

const IDLE_NOTES_KEY = "dashboard-montagem:idle-notes";
const palette = ["#0f5f8f", "#00897b", "#7b61ff", "#b23a48", "#c77700", "#455a64", "#5d6d7e", "#3a7d44", "#8e44ad", "#d35400"];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function productColor(product) {
  let hash = 0;
  for (let i = 0; i < product.length; i += 1) hash = product.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function isIdleRecord(record) {
  const text = `${record.product || ""} ${record.status || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return record.isIdle || text.includes("OCIOSIDADE");
}

function loadIdleNotes() {
  try {
    return JSON.parse(localStorage.getItem(IDLE_NOTES_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveIdleNotes(notes) {
  localStorage.setItem(IDLE_NOTES_KEY, JSON.stringify(notes));
}

function idleNoteKey(record) {
  if (record.idleNoteKey) return record.idleNoteKey;
  return `${record.employee}|${record.absoluteStart}|${record.absoluteEnd}`;
}

function idleNoteFor(record) {
  if (!record || !isIdleRecord(record)) return null;
  return loadIdleNotes()[idleNoteKey(record)] || null;
}

function idleLabel(record) {
  if (record.timelineSegmentType === "idle-remainder") return "OCIOSIDADE";
  if (record.timelineSegmentType === "lunch") return "ALMOCO";
  if (record.timelineSegmentType === "coffee") return "CAFE";
  const note = idleNoteFor(record);
  if (note?.type === "lunch") return "ALMOCO";
  if (note?.type === "coffee") return "CAFE";
  if (note?.type === "description" && note.description) return note.description.toUpperCase();
  return record.product;
}

function idleStatus(record) {
  if (record.timelineSegmentType === "idle-remainder") return "Ociosidade";
  if (record.timelineSegmentType === "lunch") return "Almoco";
  if (record.timelineSegmentType === "coffee") return "Cafe";
  const note = idleNoteFor(record);
  if (note?.type === "lunch") return "Almoco";
  if (note?.type === "coffee") return "Cafe";
  if (note?.type === "description" && note.description) return note.description;
  return record.status;
}

function isTimedPauseType(type) {
  return type === "lunch" || type === "coffee";
}

function idlePausePeriod(record) {
  if (record.timelineSegmentType === "idle-remainder") return "";
  const note = idleNoteFor(record);
  if (!isTimedPauseType(note?.type)) return "";
  return [note.startTime, note.endTime].filter(Boolean).join(" - ");
}

function performanceClass(record) {
  if (record.timelineSegmentType === "idle-remainder") return "timeline-idle";
  if (record.timelineSegmentType === "lunch") return "timeline-idle-lunch";
  if (record.timelineSegmentType === "coffee") return "timeline-idle-coffee";
  const note = idleNoteFor(record);
  if (note?.type === "lunch") return "timeline-idle-lunch";
  if (note?.type === "coffee") return "timeline-idle-coffee";
  if (isIdleRecord(record)) return "timeline-idle";
  if (record.isRunning) return "timeline-running";
  if (record.status.includes("Muito")) return "timeline-critical";
  if (record.status.includes("Acima")) return "timeline-warning";
  if (record.status.includes("Sobreposicao") || record.status.includes("Sobreposi") || record.status.includes("inconsistente")) return "timeline-invalid";
  return "timeline-ok";
}

function tooltipHtml(record) {
  const idle = isIdleRecord(record);
  return `
    <strong>${escapeHtml(idle ? idleLabel(record) : record.product || "Atividade")}</strong>
    <dl>
      <div><dt>Funcionario</dt><dd>${escapeHtml(record.employee)}</dd></div>
      <div><dt>Pecas</dt><dd>${record.quantity || 0}</dd></div>
      <div><dt>Comecou</dt><dd>${dateTimeLabel(record.absoluteStart)}</dd></div>
      <div><dt>Acabou</dt><dd>${record.endSeconds ? dateTimeLabel(record.absoluteEnd) : "Em andamento"}</dd></div>
      <div><dt>Duracao</dt><dd>${secondsToDuration(record.realSeconds)}</dd></div>
      <div><dt>Status</dt><dd>${escapeHtml(idle ? idleStatus(record) : record.status)}</dd></div>
      ${idle && idlePausePeriod(record) ? `<div><dt>Pausa</dt><dd>${escapeHtml(idlePausePeriod(record))}</dd></div>` : ""}
    </dl>
  `;
}

function timelineWindow(records, state) {
  const filteredDates = [state.filters?.startDate, state.filters?.endDate].filter(Boolean);
  const scheduleStarts = records.map((record) => scheduleSeconds(record.shift, record.employee).start).filter(Number.isFinite);
  const scheduleEnds = records.map((record) => {
    const schedule = scheduleSeconds(record.shift, record.employee);
    return schedule.end < schedule.start ? schedule.end + 86400 : schedule.end;
  }).filter(Number.isFinite);
  const startDate = filteredDates[0] || records[0]?.date;
  const endDate = filteredDates[1] || startDate;
  const scheduleStart = scheduleStarts.length ? Math.min(...scheduleStarts) : 5 * 3600;
  const scheduleEnd = scheduleEnds.length ? Math.max(...scheduleEnds) : 23 * 3600;
  const visibleStart = startDate ? Math.floor(dateAndSecondsToDate(startDate, scheduleStart - 1800).getTime() / 1000) : Math.min(...records.map((record) => record.absoluteStart));
  const visibleEnd = endDate ? Math.floor(dateAndSecondsToDate(endDate, scheduleEnd + 1800).getTime() / 1000) : Math.max(...records.map((record) => record.absoluteEnd));
  const dataStart = Math.min(...records.map((record) => record.absoluteStart), visibleStart);
  const dataEnd = Math.max(...records.map((record) => record.absoluteEnd), visibleEnd);
  return { start: absoluteSecondsToDate(dataStart), end: absoluteSecondsToDate(dataEnd) };
}

function timelineDates(records, state) {
  const startDate = state.filters?.startDate || records[0]?.date;
  const endDate = state.filters?.endDate || startDate;
  if (!startDate || !endDate) return [...new Set(records.map((record) => record.date).filter(Boolean))].sort();
  const dates = [];
  let cursor = startDate;
  while (cursor <= endDate && dates.length < 370) {
    dates.push(cursor);
    cursor = addDaysISO(cursor, 1);
  }
  return dates;
}

function groupLabel(employee, records) {
  const sample = records.find((record) => record.employee === employee);
  const schedule = scheduleSeconds(sample?.shift, employee).schedule;
  const workType = schedule.workType || "Montagem";
  const start = schedule.start || "05:00";
  const end = schedule.end || "14:00";
  return `
    <div class="timeline-group-label">
      <strong>${escapeHtml(employee)}</strong>
      <span>${escapeHtml(workType)} · ${start}-${end}</span>
    </div>
  `;
}

function moveTooltip(event) {
  const tooltip = document.getElementById("timeline-tooltip");
  if (!tooltip || tooltip.hidden) return;
  const margin = 16;
  const rect = tooltip.getBoundingClientRect();
  let left = event.clientX + margin;
  let top = event.clientY + margin;
  if (left + rect.width > window.innerWidth - margin) left = event.clientX - rect.width - margin;
  if (top + rect.height > window.innerHeight - margin) top = event.clientY - rect.height - margin;
  tooltip.style.left = `${Math.max(margin, left)}px`;
  tooltip.style.top = `${Math.max(margin, top)}px`;
}

function absoluteClockInRecord(record, value) {
  const seconds = parseTime(value);
  if (!Number.isFinite(seconds)) return null;
  const dayStart = dateToDayStartSeconds(record.date);
  const candidates = [dayStart + seconds - 86400, dayStart + seconds, dayStart + seconds + 86400];
  const inside = candidates.find((candidate) => candidate >= record.absoluteStart && candidate <= record.absoluteEnd);
  if (Number.isFinite(inside)) return inside;
  return candidates.sort((a, b) => Math.abs(a - record.absoluteStart) - Math.abs(b - record.absoluteStart))[0];
}

function idleSegment(record, suffix, start, end, product, status, type) {
  const dayStart = dateToDayStartSeconds(record.date);
  return {
    ...record,
    id: `${record.id}-${suffix}`,
    product,
    status,
    startSeconds: start - dayStart,
    endSeconds: end - dayStart,
    absoluteStart: start,
    absoluteEnd: end,
    realSeconds: end - start,
    idleNoteKey: idleNoteKey(record),
    sourceIdleRecord: record,
    timelineSegmentType: type
  };
}

function splitIdleRecord(record) {
  if (!isIdleRecord(record)) return [record];
  const note = idleNoteFor(record);
  if (!isTimedPauseType(note?.type) || !note.startTime || !note.endTime) return [record];
  const pauseLabel = note.type === "coffee" ? "CAFE" : "ALMOCO";
  const pauseStatus = note.type === "coffee" ? "Cafe" : "Almoco";
  const segmentType = note.type === "coffee" ? "coffee" : "lunch";
  const suffix = note.type === "coffee" ? "coffee" : "lunch";

  let lunchStart = absoluteClockInRecord(record, note.startTime);
  let lunchEnd = absoluteClockInRecord(record, note.endTime);
  if (!Number.isFinite(lunchStart) || !Number.isFinite(lunchEnd)) return [record];
  if (lunchEnd <= lunchStart) lunchEnd += 86400;

  lunchStart = Math.max(record.absoluteStart, lunchStart);
  lunchEnd = Math.min(record.absoluteEnd, lunchEnd);
  if (lunchEnd - lunchStart <= 0) return [record];

  const segments = [];
  if (lunchStart - record.absoluteStart > 60) {
    segments.push(idleSegment(record, `before-${suffix}`, record.absoluteStart, lunchStart, "OCIOSIDADE", "Ociosidade", "idle-remainder"));
  }
  segments.push(idleSegment(record, suffix, lunchStart, lunchEnd, pauseLabel, pauseStatus, segmentType));
  if (record.absoluteEnd - lunchEnd > 60) {
    segments.push(idleSegment(record, `after-${suffix}`, lunchEnd, record.absoluteEnd, "OCIOSIDADE", "Ociosidade", "idle-remainder"));
  }
  return segments;
}

function timelineActivityRecords(records) {
  return records.flatMap((record) => splitIdleRecord(record));
}

export function timelineControls(state) {
  return `
    <section class="timeline-toolbar">
      <button class="button" data-action="timeline-15"><i data-lucide="zoom-in"></i> 15 min</button>
      <button class="button" data-action="timeline-30">30 min</button>
      <button class="button" data-action="timeline-60">1 hora</button>
      <button class="button" data-action="timeline-now"><i data-lucide="crosshair"></i> Agora</button>
      <button class="button" data-action="timeline-full"><i data-lucide="maximize"></i> Tela cheia</button>
      <button class="button" data-action="timeline-export"><i data-lucide="download"></i> Exportar</button>
      <label class="segmented"><input type="checkbox" data-action="timeline-color" ${state.timelineColor === "performance" ? "checked" : ""}> Cor por desempenho</label>
    </section>
    <div class="panel timeline-panel"><div id="timeline"></div></div>
    <div id="timeline-tooltip" class="timeline-tooltip" hidden></div>
    <div id="idle-modal" class="modal-backdrop" hidden>
      <form class="modal-card" id="idle-form">
        <div class="section-title">
          <div>
            <h2>Apontar pausa</h2>
            <p id="idle-modal-subtitle">Classifique a ociosidade selecionada.</p>
          </div>
        </div>
        <div class="idle-options">
          <label><input type="radio" name="idleType" value="lunch"> Almoco</label>
          <label><input type="radio" name="idleType" value="coffee"> Cafe</label>
          <label><input type="radio" name="idleType" value="description"> Descrever ocorrencia</label>
        </div>
        <div class="idle-time-grid">
          <label>Hora inicial
            <input type="time" id="idle-lunch-start">
          </label>
          <label>Hora final
            <input type="time" id="idle-lunch-end">
          </label>
        </div>
        <label>Descricao
          <textarea id="idle-description" rows="4" placeholder="Descreva o que ocorreu nesta pausa"></textarea>
        </label>
        <div class="modal-actions">
          <button class="button primary" type="submit">Salvar</button>
          <button class="button" type="button" data-action="clear-idle-note">Remover apontamento</button>
          <button class="button" type="button" data-action="close-idle-modal">Cancelar</button>
        </div>
      </form>
    </div>
  `;
}

function closeIdleModal() {
  const modal = document.getElementById("idle-modal");
  if (modal) modal.hidden = true;
  activeIdleRecord = null;
}

function openIdleModal(record) {
  activeIdleRecord = record;
  const modal = document.getElementById("idle-modal");
  const subtitle = document.getElementById("idle-modal-subtitle");
  const description = document.getElementById("idle-description");
  const lunchStart = document.getElementById("idle-lunch-start");
  const lunchEnd = document.getElementById("idle-lunch-end");
  const note = idleNoteFor(record);
  if (!modal || !description) return;

  const type = note?.type || "lunch";
  document.querySelectorAll("input[name='idleType']").forEach((input) => {
    input.checked = input.value === type;
  });
  description.value = note?.description || "";
  if (lunchStart) lunchStart.value = note?.startTime || secondsToClock(record.startSeconds);
  if (lunchEnd) lunchEnd.value = note?.endTime || secondsToClock(record.endSeconds);
  if (subtitle) subtitle.textContent = `${record.employee} - ${dateTimeLabel(record.absoluteStart)} ate ${dateTimeLabel(record.absoluteEnd)}`;
  modal.hidden = false;
}

function bindIdleModal(records, state) {
  document.querySelector("[data-action='close-idle-modal']")?.addEventListener("click", closeIdleModal);
  document.getElementById("idle-modal")?.addEventListener("click", (event) => {
    if (event.target.id === "idle-modal") closeIdleModal();
  });
  document.querySelector("[data-action='clear-idle-note']")?.addEventListener("click", () => {
    if (!activeIdleRecord) return;
    const notes = loadIdleNotes();
    delete notes[idleNoteKey(activeIdleRecord)];
    saveIdleNotes(notes);
    closeIdleModal();
    renderTimeline(records, state);
  });
  document.getElementById("idle-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!activeIdleRecord) return;
    const type = document.querySelector("input[name='idleType']:checked")?.value || "lunch";
    const description = document.getElementById("idle-description")?.value.trim() || "";
    const startTime = document.getElementById("idle-lunch-start")?.value || "";
    const endTime = document.getElementById("idle-lunch-end")?.value || "";
    if (isTimedPauseType(type) && (!startTime || !endTime)) {
      window.alert("Informe a hora inicial e final da pausa.");
      return;
    }
    if (isTimedPauseType(type)) {
      let lunchStart = absoluteClockInRecord(activeIdleRecord, startTime);
      let lunchEnd = absoluteClockInRecord(activeIdleRecord, endTime);
      if (Number.isFinite(lunchStart) && Number.isFinite(lunchEnd) && lunchEnd <= lunchStart) lunchEnd += 86400;
      if (!Number.isFinite(lunchStart) || !Number.isFinite(lunchEnd) || lunchEnd <= activeIdleRecord.absoluteStart || lunchStart >= activeIdleRecord.absoluteEnd || lunchEnd <= lunchStart) {
        window.alert("O horario da pausa precisa estar dentro da ociosidade selecionada.");
        return;
      }
    }
    const notes = loadIdleNotes();
    notes[idleNoteKey(activeIdleRecord)] = {
      type,
      description: type === "description" ? description : "",
      startTime: isTimedPauseType(type) ? startTime : "",
      endTime: isTimedPauseType(type) ? endTime : "",
      updatedAt: new Date().toISOString()
    };
    saveIdleNotes(notes);
    closeIdleModal();
    renderTimeline(records, state);
  });
}

export function renderTimeline(records, state) {
  const container = document.getElementById("timeline");
  if (!container) return;
  if (timeline) timeline.destroy();

  const timelineRecords = timelineActivityRecords(records);
  const recordsById = new Map(timelineRecords.map((record) => [record.id, record]));
  const employees = [...new Set(records.map((record) => record.employee).filter(Boolean))].sort();
  const groups = new DataSet(employees.map((employee, index) => ({ id: employee, content: groupLabel(employee, records), order: index })));
  const activityItems = timelineRecords.map((record) => {
    const idle = isIdleRecord(record);
    const displayProduct = idle ? idleLabel(record) : record.product;
    const productModeStyle = state.timelineColor === "product" ? `background-color:${productColor(record.product)};border-color:transparent;color:#fff` : "";
    return {
      id: record.id,
      group: record.employee,
      start: absoluteSecondsToDate(record.absoluteStart),
      end: absoluteSecondsToDate(record.absoluteEnd || record.absoluteStart + 60),
      content: `<span>${escapeHtml(displayProduct)}</span><small>${record.quantity || ""} ${secondsToClock(record.startSeconds)}-${record.endSeconds ? secondsToClock(record.endSeconds) : "agora"}</small>`,
      className: state.timelineColor === "performance" || idle ? performanceClass(record) : "",
      style: idle ? "" : productModeStyle
    };
  });
  const workWindowItems = employees.flatMap((employee) => {
    const sample = records.find((record) => record.employee === employee);
    const scheduleInfo = scheduleSeconds(sample?.shift, employee);
    const startSeconds = scheduleInfo.start;
    const endSeconds = scheduleInfo.end < scheduleInfo.start ? scheduleInfo.end + 86400 : scheduleInfo.end;
    return timelineDates(records, state).map((date) => ({
      id: `work-${employee}-${date}`,
      group: employee,
      type: "background",
      start: dateAndSecondsToDate(date, startSeconds),
      end: dateAndSecondsToDate(date, endSeconds),
      className: "timeline-work-window"
    }));
  });
  const items = new DataSet([...workWindowItems, ...activityItems]);
  const window = timelineWindow(records, state);
  timeline = new Timeline(container, items, groups, {
    stack: false,
    horizontalScroll: true,
    zoomKey: "ctrlKey",
    orientation: "top",
    margin: { item: 8, axis: 16 },
    start: window.start,
    end: window.end,
    editable: false
  });
  timeline.addCustomTime(new Date(), "now");
  bindIdleModal(records, state);

  const tooltip = document.getElementById("timeline-tooltip");
  container.addEventListener("mousemove", moveTooltip);
  timeline.on("itemover", (properties) => {
    const record = recordsById.get(properties.item);
    if (!tooltip || !record) return;
    tooltip.innerHTML = tooltipHtml(record);
    tooltip.hidden = false;
    moveTooltip(properties.event);
  });
  timeline.on("itemout", () => {
    if (tooltip) tooltip.hidden = true;
  });
  timeline.on("click", (properties) => {
    const record = recordsById.get(properties.item);
    if (!record || !isIdleRecord(record)) return;
    if (tooltip) tooltip.hidden = true;
    openIdleModal(record.sourceIdleRecord || record);
  });
}

export function setTimelineWindow(minutes) {
  if (!timeline) return;
  const now = new Date();
  timeline.setWindow(new Date(now.getTime() - minutes * 60000), new Date(now.getTime() + minutes * 60000), { animation: true });
}
