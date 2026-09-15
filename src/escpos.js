import { formatRupiah } from "./utils.js";

const LINE_WIDTH = 32;
const ESC = 0x1b;
const GS = 0x1d;

const INIT = new Uint8Array([ESC, 0x40]);
const ALIGN_LEFT = new Uint8Array([ESC, 0x61, 0x00]);
const ALIGN_CENTER = new Uint8Array([ESC, 0x61, 0x01]);
const ALIGN_RIGHT = new Uint8Array([ESC, 0x61, 0x02]);
const BOLD_ON = new Uint8Array([ESC, 0x45, 0x01]);
const BOLD_OFF = new Uint8Array([ESC, 0x45, 0x00]);
const DOUBLE_ON = new Uint8Array([GS, 0x21, 0x11]);
const DOUBLE_OFF = new Uint8Array([GS, 0x21, 0x00]);
const FEED_AND_CUT = new Uint8Array([0x0a, 0x0a, 0x0a, GS, 0x56, 0x42, 0x00]);

const DASH_LINE = "-".repeat(LINE_WIDTH);

function encodeLine(str) {
  return new TextEncoder().encode(str + "\n");
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function twoColumnLine(left, right) {
  const maxLeft = Math.max(1, LINE_WIDTH - right.length - 1);
  const l = left.length > maxLeft ? left.slice(0, maxLeft) : left;
  const gap = Math.max(1, LINE_WIDTH - l.length - right.length);
  return l + " ".repeat(gap) + right;
}

export function formatJakartaDateTime(iso) {
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

export function buildReceiptEscPos({
  shopNameLines,
  addressLine1,
  addressLine2,
  whatsapp,
  providerName,
  paidAt,
  items,
  amount,
}) {
  const chunks = [INIT, ALIGN_CENTER, BOLD_ON, DOUBLE_ON];
  for (const line of shopNameLines) {
    chunks.push(encodeLine(line));
  }
  chunks.push(DOUBLE_OFF, BOLD_OFF);
  chunks.push(encodeLine(addressLine1));
  chunks.push(encodeLine(addressLine2));
  chunks.push(encodeLine(`WA ${whatsapp}`));
  chunks.push(ALIGN_LEFT, encodeLine(DASH_LINE));
  chunks.push(ALIGN_CENTER, BOLD_ON, encodeLine("Tanda Terima Pembayaran"), BOLD_OFF);
  chunks.push(encodeLine(providerName));
  chunks.push(encodeLine(paidAt));
  chunks.push(ALIGN_LEFT, encodeLine(DASH_LINE));

  for (const it of items) {
    const discountQty = it.discount_qty || 0;
    const wasteQty = it.waste_qty || 0;
    const normalQty = it.qty - discountQty - wasteQty;
    const rowTotal = normalQty * it.unit_cost + discountQty * (it.discount_price || 0);
    chunks.push(encodeLine(twoColumnLine(it.product_name, formatRupiah(rowTotal))));
    if (normalQty > 0) {
      chunks.push(encodeLine(`  ${normalQty} x ${formatRupiah(it.unit_cost)}`));
    }
    if (discountQty > 0) {
      chunks.push(encodeLine(`  ${discountQty} diskon x ${formatRupiah(it.discount_price || 0)}`));
    }
    if (wasteQty > 0) {
      chunks.push(encodeLine(`  ${wasteQty} rusak/dibuang`));
    }
  }

  chunks.push(encodeLine(DASH_LINE));
  chunks.push(ALIGN_RIGHT, BOLD_ON, encodeLine(`Total: ${formatRupiah(amount)}`), BOLD_OFF, ALIGN_LEFT);
  chunks.push(FEED_AND_CUT);

  return concatBytes(chunks);
}

export function toBase64(bytes) {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function rawbtPrintUrl(bytes) {
  return `rawbt:base64,${toBase64(bytes)}`;
}
