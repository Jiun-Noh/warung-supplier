import { formatDateID } from "./utils.js";
import { buildReceiptEscPos, rawbtPrintUrl } from "./escpos.js";

export const SHOP_NAME = "Warung Ceria Aneka Kue";
export const SHOP_NAME_LINES = ["Warung Ceria", "Aneka Kue"];
export const SHOP_ADDRESS_LINE1 = "Jl. Merpati No. 44B";
export const SHOP_ADDRESS_LINE2 = "Denpasar Barat";
export const SHOP_WHATSAPP = "085238848579";

export function deliveryDateLabel(items) {
  const dates = [...new Set(items.map((it) => it.delivery_date))].sort();
  if (dates.length === 0) return "";
  if (dates.length === 1) return formatDateID(dates[0]);
  return `${formatDateID(dates[0])} - ${formatDateID(dates[dates.length - 1])}`;
}

export function receiptPrintUrl(payment, items) {
  const bytes = buildReceiptEscPos({
    shopNameLines: SHOP_NAME_LINES,
    addressLine1: SHOP_ADDRESS_LINE1,
    addressLine2: SHOP_ADDRESS_LINE2,
    whatsapp: SHOP_WHATSAPP,
    providerName: payment.provider_name,
    dateLabel: deliveryDateLabel(items),
    items,
    amount: payment.amount,
  });
  return rawbtPrintUrl(bytes);
}
