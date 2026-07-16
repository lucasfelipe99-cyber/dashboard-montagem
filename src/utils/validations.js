export function detectOverlap(records) {
  const sorted = [...records].sort((a, b) => a.absoluteStart - b.absoluteStart);
  const overlapIds = new Set();
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].absoluteStart < sorted[i - 1].absoluteEnd) {
      overlapIds.add(sorted[i].id);
      overlapIds.add(sorted[i - 1].id);
    }
  }
  return overlapIds;
}

export function fingerprint(record) {
  return [record.date, record.employee, record.product, record.startSeconds, record.endSeconds, record.quantity].join("|").toLowerCase();
}
