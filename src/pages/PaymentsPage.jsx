import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";
import { addDays, formatRupiah, sanitizeQtyInput, todayISODate } from "../utils.js";
import { SHOP_NAME, SHOP_ADDRESS_LINE1, SHOP_ADDRESS_LINE2, SHOP_WHATSAPP, deliveryDateLabel, receiptPrintUrl } from "../receipt.js";

const CYCLE_LABEL = {
  harian: "Harian",
  mingguan: "Mingguan",
  bulanan: "Bulanan",
};

function defaultAdjustment() {
  return {
    discountQty: "",
    discountPrice: "",
    wasteQty: "",
  };
}

function normalQtyOf(item, adj) {
  const discountQty = Number(adj.discountQty) || 0;
  const wasteQty = Number(adj.wasteQty) || 0;
  return item.qty - discountQty - wasteQty;
}

function settledAmount(item, adj) {
  const normalQty = Math.max(0, normalQtyOf(item, adj));
  const discountQty = Number(adj.discountQty) || 0;
  const discountPrice = Number(adj.discountPrice) || 0;
  return normalQty * item.unit_cost + discountQty * discountPrice;
}

function groupByProvider(items) {
  const map = {};
  for (const item of items) {
    const key = item.provider_id || "none";
    if (!map[key]) {
      map[key] = {
        providerId: item.provider_id,
        providerName: item.providers?.name || "Tanpa provider",
        cycle: item.providers?.payment_cycle,
        items: [],
        total: 0,
      };
    }
    map[key].items.push(item);
    map[key].total += item.qty * item.unit_cost;
  }
  return Object.values(map).sort((a, b) => b.total - a.total);
}

function Receipt({ payment, items, onClose, onDelete }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet receipt-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="receipt-print">
          <div className="receipt-header">
            <div className="receipt-title">{SHOP_NAME}</div>
            <div>{SHOP_ADDRESS_LINE1}</div>
            <div>{SHOP_ADDRESS_LINE2}</div>
            <div>WA {SHOP_WHATSAPP}</div>
            <div style={{ marginTop: 6 }}>Tanda Terima Pembayaran</div>
            <div>{payment.provider_name}</div>
            <div>{deliveryDateLabel(items)}</div>
          </div>
          <div className="receipt-items">
            {items.map((it) => {
              const discountQty = it.discount_qty || 0;
              const wasteQty = it.waste_qty || 0;
              const normalQty = it.qty - discountQty - wasteQty;
              const rowTotal = normalQty * it.unit_cost + discountQty * (it.discount_price || 0);
              const hasAdjustment = discountQty > 0 || wasteQty > 0;
              return (
                <div className="receipt-item" key={it.id}>
                  <div className="receipt-item-row">
                    <div>{it.product_name}</div>
                    <div>{formatRupiah(rowTotal)}</div>
                  </div>
                  {hasAdjustment ? (
                    <>
                      {normalQty > 0 && (
                        <div className="receipt-item-sub">
                          {normalQty} × {formatRupiah(it.unit_cost)}
                        </div>
                      )}
                      {discountQty > 0 && (
                        <div className="receipt-item-sub">
                          {discountQty} diskon × {formatRupiah(it.discount_price)}
                        </div>
                      )}
                      {wasteQty > 0 && (
                        <div className="receipt-item-sub">{wasteQty} rusak/dibuang</div>
                      )}
                    </>
                  ) : (
                    <div className="receipt-item-sub">
                      {it.qty} × {formatRupiah(it.unit_cost)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="receipt-total">
            <div>Total</div>
            <div>{formatRupiah(payment.amount)}</div>
          </div>
        </div>
        <div className="sheet-actions no-print">
          <button className="btn-danger" onClick={() => onDelete(payment)}>
            Hapus
          </button>
          <button className="btn-secondary" onClick={onClose}>
            Tutup
          </button>
          <a
            className="btn-primary"
            href={receiptPrintUrl(payment, items)}
            onClick={onClose}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
          >
            Cetak
          </a>
        </div>
      </div>
    </div>
  );
}

export default function PaymentsPage({ onToast }) {
  const [date, setDate] = useState(todayISODate());
  const [unpaidItems, setUnpaidItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProviderId, setSelectedProviderId] = useState(undefined);
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState(null); // { payment, items }
  const [adjustments, setAdjustments] = useState({}); // itemId -> { discountQty, discountPrice, wasteQty }
  const [adjustingItem, setAdjustingItem] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadUnpaid();
  }, []);

  useEffect(() => {
    loadPayments(date);
  }, [date]);

  async function loadUnpaid() {
    setLoading(true);
    const { data, error } = await supabase
      .from("delivery_items")
      .select("*, providers(name, payment_cycle)")
      .eq("paid", false);
    if (error) console.error(error);
    setUnpaidItems(data || []);
    setLoading(false);
  }

  async function loadPayments(forDate) {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .gte("paid_at", `${forDate}T00:00:00+08:00`)
      .lt("paid_at", `${addDays(forDate, 1)}T00:00:00+08:00`)
      .order("paid_at", { ascending: false });
    if (error) console.error(error);
    setPayments(data || []);
  }

  async function payProvider(group) {
    setPaying(true);

    const rows = group.items.map((it) => {
      const adj = adjustments[it.id] || defaultAdjustment(it);
      return {
        item: it,
        normalQty: Math.max(0, normalQtyOf(it, adj)),
        discountQty: Number(adj.discountQty) || 0,
        discountPrice: Number(adj.discountPrice) || 0,
        wasteQty: Number(adj.wasteQty) || 0,
      };
    });
    const amount = rows.reduce((sum, r) => sum + r.normalQty * r.item.unit_cost + r.discountQty * r.discountPrice, 0);

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        provider_id: group.providerId,
        provider_name: group.providerName,
        amount,
      })
      .select()
      .single();

    if (paymentError) {
      console.error(paymentError);
      setPaying(false);
      onToast("Gagal membuat pembayaran");
      return;
    }

    const updateResults = await Promise.all(
      rows.map((r) =>
        supabase
          .from("delivery_items")
          .update({
            paid: true,
            payment_id: payment.id,
            discount_qty: r.discountQty,
            discount_price: r.discountQty > 0 ? r.discountPrice : null,
            waste_qty: r.wasteQty,
          })
          .eq("id", r.item.id)
      )
    );
    setPaying(false);

    const updateError = updateResults.find((res) => res.error)?.error;
    if (updateError) {
      console.error(updateError);
      onToast("Pembayaran dibuat tapi gagal menandai barang");
      return;
    }

    onToast(`Pembayaran ke ${group.providerName} tersimpan`);
    setSelectedProviderId(undefined);
    setReceipt({
      payment,
      items: rows.map((r) => ({
        ...r.item,
        discount_qty: r.discountQty,
        discount_price: r.discountQty > 0 ? r.discountPrice : null,
        waste_qty: r.wasteQty,
      })),
    });
    setAdjustments({});
    const today = todayISODate();
    setDate(today);
    loadUnpaid();
    loadPayments(today);
  }

  async function reprintPayment(payment) {
    const { data, error } = await supabase
      .from("delivery_items")
      .select("*")
      .eq("payment_id", payment.id);
    if (error) {
      console.error(error);
      onToast("Gagal memuat detail pembayaran");
      return;
    }
    setReceipt({ payment, items: data || [] });
  }

  async function deletePayment(payment) {
    const { error: resetError } = await supabase
      .from("delivery_items")
      .update({ paid: false, payment_id: null, discount_qty: 0, discount_price: null, waste_qty: 0 })
      .eq("payment_id", payment.id);
    if (resetError) {
      console.error(resetError);
      onToast("Gagal membatalkan pembayaran");
      return;
    }

    const { error: deleteError } = await supabase.from("payments").delete().eq("id", payment.id);
    if (deleteError) {
      console.error(deleteError);
      onToast("Gagal menghapus pembayaran");
      return;
    }

    onToast("Pembayaran dibatalkan, barang kembali ke daftar belum dibayar");
    setReceipt(null);
    loadUnpaid();
    loadPayments(date);
  }

  async function deleteUnpaidItem(id) {
    const { error } = await supabase.from("delivery_items").delete().eq("id", id);
    if (error) {
      console.error(error);
      onToast("Gagal menghapus");
      return;
    }
    setAdjustments((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
    setAdjustingItem(null);
    onToast("Barang dihapus dari daftar");
    loadUnpaid();
  }

  if (loading) return <div className="empty-state">Memuat…</div>;

  const groups = groupByProvider(unpaidItems);
  const selectedGroup = groups.find((g) => g.providerId === selectedProviderId);
  const filteredGroups = search.trim()
    ? groups.filter((g) => g.providerName.toLowerCase().includes(search.trim().toLowerCase()))
    : groups;
  const filteredPayments = search.trim()
    ? payments.filter((p) => p.provider_name.toLowerCase().includes(search.trim().toLowerCase()))
    : payments;

  return (
    <div>
      {(groups.length > 0 || payments.length > 0) && (
        <input
          type="text"
          className="search-input"
          placeholder="Cari provider…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      <div className="section-title">Provider dengan tagihan belum dibayar</div>

      {groups.length === 0 && (
        <div className="empty-state">Tidak ada tagihan yang belum dibayar. Lunas semua!</div>
      )}
      {groups.length > 0 && filteredGroups.length === 0 && (
        <div className="empty-state">Tidak ada provider yang cocok dengan "{search}"</div>
      )}

      {filteredGroups.map((g) => (
        <div
          className="list-row"
          key={g.providerId || "none"}
          onClick={() => setSelectedProviderId(g.providerId)}
        >
          <div>
            <div className="name">{g.providerName}</div>
            <div className="meta">
              {CYCLE_LABEL[g.cycle] || "Harian"} · {g.items.length} barang
            </div>
          </div>
          <div style={{ fontWeight: 800, color: "var(--chili-600)" }}>{formatRupiah(g.total)}</div>
        </div>
      ))}

      <div className="section-title" style={{ marginTop: 20 }}>
        Riwayat Pembayaran
      </div>
      <input type="date" className="date-input" value={date} onChange={(e) => setDate(e.target.value)} />

      {payments.length === 0 ? (
        <div className="empty-state">Belum ada pembayaran pada tanggal ini.</div>
      ) : filteredPayments.length === 0 ? (
        <div className="empty-state">Tidak ada riwayat yang cocok dengan "{search}"</div>
      ) : (
        filteredPayments.map((p) => (
          <div className="list-row" key={p.id} onClick={() => reprintPayment(p)}>
            <div>
              <div className="name">{p.provider_name}</div>
              <div className="meta">{new Date(p.paid_at).toLocaleString("id-ID")}</div>
            </div>
            <div style={{ fontWeight: 700 }}>{formatRupiah(p.amount)}</div>
          </div>
        ))
      )}

      {selectedGroup &&
        (() => {
          const adjustedTotal = selectedGroup.items.reduce(
            (sum, it) => sum + settledAmount(it, adjustments[it.id] || defaultAdjustment(it)),
            0
          );
          return (
            <div
              className="sheet-backdrop"
              onClick={() => {
                setSelectedProviderId(undefined);
                setAdjustments({});
              }}
            >
              <div className="sheet" onClick={(e) => e.stopPropagation()}>
                <h2>{selectedGroup.providerName}</h2>
                {selectedGroup.items.map((it) => {
                  const adj = adjustments[it.id] || defaultAdjustment(it);
                  const hasAdjustment = Number(adj.discountQty) > 0 || Number(adj.wasteQty) > 0;
                  return (
                    <div
                      className="list-row"
                      key={it.id}
                      onClick={() => setAdjustingItem({ ...it, ...adj })}
                    >
                      <div>
                        <div className="name">{it.product_name}</div>
                        <div className="meta">
                          {hasAdjustment
                            ? `${normalQtyOf(it, adj)} normal · ${adj.discountQty || 0} diskon · ${adj.wasteQty || 0} rusak`
                            : `${it.qty} × ${formatRupiah(it.unit_cost)}`}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ fontWeight: 700 }}>{formatRupiah(settledAmount(it, adj))}</div>
                        <button
                          type="button"
                          className="delivery-row-remove"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteUnpaidItem(it.id);
                          }}
                          aria-label="Hapus barang"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className="list-row" style={{ background: "transparent", border: "none" }}>
                  <div className="name">Total</div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{formatRupiah(adjustedTotal)}</div>
                </div>
                <div className="sheet-actions">
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setSelectedProviderId(undefined);
                      setAdjustments({});
                    }}
                  >
                    Batal
                  </button>
                  <button
                    className="btn-primary"
                    disabled={paying}
                    onClick={() => payProvider(selectedGroup)}
                  >
                    {paying ? "Menyimpan…" : `Bayar ${formatRupiah(adjustedTotal)}`}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {adjustingItem &&
        (() => {
          const discountQty = Number(adjustingItem.discountQty) || 0;
          const wasteQty = Number(adjustingItem.wasteQty) || 0;
          const normalQty = adjustingItem.qty - discountQty - wasteQty;
          const overLimit = normalQty < 0;
          return (
            <div className="sheet-backdrop" onClick={() => setAdjustingItem(null)}>
              <div className="sheet" onClick={(e) => e.stopPropagation()}>
                <h2>{adjustingItem.product_name}</h2>
                <div className="meta" style={{ marginBottom: 10 }}>
                  Diterima: {adjustingItem.qty}
                </div>
                <div className="form-row-split">
                  <div className="form-field">
                    <label>Jumlah Diskon</label>
                    <input
                      inputMode="numeric"
                      placeholder="0"
                      value={adjustingItem.discountQty}
                      onChange={(e) =>
                        setAdjustingItem((f) => ({
                          ...f,
                          discountQty: sanitizeQtyInput(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <div className="form-field">
                    <label>Harga Diskon (Rp)</label>
                    <input
                      inputMode="numeric"
                      placeholder={String(adjustingItem.unit_cost)}
                      value={adjustingItem.discountPrice}
                      onChange={(e) =>
                        setAdjustingItem((f) => ({
                          ...f,
                          discountPrice: sanitizeQtyInput(e.target.value),
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="form-field">
                  <label>Jumlah Rusak / Dibuang</label>
                  <input
                    inputMode="numeric"
                    placeholder="0"
                    value={adjustingItem.wasteQty}
                    onChange={(e) =>
                      setAdjustingItem((f) => ({
                        ...f,
                        wasteQty: sanitizeQtyInput(e.target.value),
                      }))
                    }
                  />
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: overLimit ? "var(--chili-600)" : "var(--ink-500)",
                    marginBottom: 10,
                  }}
                >
                  {overLimit
                    ? `Diskon + rusak (${discountQty + wasteQty}) melebihi jumlah diterima (${adjustingItem.qty})`
                    : `Normal: ${normalQty} · Diskon: ${discountQty} · Rusak: ${wasteQty} (dari ${adjustingItem.qty} diterima)`}
                </div>
                <div className="sheet-actions">
                  <button className="btn-danger" onClick={() => deleteUnpaidItem(adjustingItem.id)}>
                    Hapus
                  </button>
                  <button className="btn-secondary" onClick={() => setAdjustingItem(null)}>
                    Batal
                  </button>
                  <button
                    className="btn-primary"
                    disabled={overLimit}
                    onClick={() => {
                      setAdjustments((s) => ({
                        ...s,
                        [adjustingItem.id]: {
                          discountQty: adjustingItem.discountQty,
                          discountPrice: adjustingItem.discountPrice,
                          wasteQty: adjustingItem.wasteQty,
                        },
                      }));
                      setAdjustingItem(null);
                    }}
                  >
                    Simpan
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {receipt && (
        <Receipt
          payment={receipt.payment}
          items={receipt.items}
          onClose={() => setReceipt(null)}
          onDelete={deletePayment}
        />
      )}
    </div>
  );
}
