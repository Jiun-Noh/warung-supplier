export function formatRupiah(n) {
  return "Rp" + Number(n || 0).toLocaleString("id-ID");
}

export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function formatDateID(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

export function todayISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayLabel() {
  return new Date().toLocaleDateString("id-ID", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}
