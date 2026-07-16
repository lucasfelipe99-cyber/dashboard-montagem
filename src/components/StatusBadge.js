export function statusBadge(status) {
  const key = String(status || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "-");
  return `<span class="status status-${key}">${status || "Sem status"}</span>`;
}
