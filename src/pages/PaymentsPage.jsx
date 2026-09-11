import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";
import { formatRupiah } from "../utils.js";

const CYCLE_LABEL = {
  harian: "Harian",
  mingguan: "Mingguan",
  bulanan: "Bulanan",
};

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

function Receipt({ payment, items, onClose }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet receipt-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="receipt-print">
          <div className="receipt-header">
            <div className="receipt-title">Tanda Terima Pembayaran</div>
            <div>{payment.provider_name}</div>
            <div>{new Date(payment.paid_at).toLocaleString("id-ID")}</div>
          </div>
          <div className="receipt-items">
            {items.map((it) => (
              <div className="receipt-item" key={it.id}>
                <div>
                  {it.product_name} × {it.qty}
                </div>
                <div>{formatRupiah(it.qty * it.unit_cost)}</div>
              </div>
            ))}
          </div>
          <div className="receipt-total">
            <div>Total</div>
            <div>{formatRupiah(payment.amount)}</div>
          </div>
        </div>
        <div className="sheet-actions no-print">
          <button className="btn-secondary" onClick={onClose}>
            Tutup
          </button>
          <button className="btn-primary" onClick={() => window.print()}>
            Cetak
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PaymentsPage({ onToast }) {
  const [unpaidItems, setUnpaidItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProviderId, setSelectedProviderId] = useState(undefined);
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState(null); // { payment, items }

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: unpaidData, error: unpaidErr }, { data: paymentData, error: paymentErr }] =
      await Promise.all([
        supabase
          .from("delivery_items")
          .select("*, providers(name, payment_cycle)")
          .eq("paid", false),
        supabase
          .from("payments")
          .select("*")
          .order("paid_at", { ascending: false })
          .limit(20),
      ]);
    if (unpaidErr) console.error(unpaidErr);
    if (paymentErr) console.error(paymentErr);
    setUnpaidItems(unpaidData || []);
    setPayments(paymentData || []);
    setLoading(false);
  }

  async function payProvider(group) {
    setPaying(true);
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        provider_id: group.providerId,
        provider_name: group.providerName,
        amount: group.total,
      })
      .select()
      .single();

    if (paymentError) {
      console.error(paymentError);
      setPaying(false);
      onToast("Gagal membuat pembayaran");
      return;
    }

    const itemIds = group.items.map((it) => it.id);
    const { error: updateError } = await supabase
      .from("delivery_items")
      .update({ paid: true, payment_id: payment.id })
      .in("id", itemIds);
    setPaying(false);

    if (updateError) {
      console.error(updateError);
      onToast("Pembayaran dibuat tapi gagal menandai barang");
      return;
    }

    onToast(`Pembayaran ke ${group.providerName} tersimpan`);
    setSelectedProviderId(undefined);
    setReceipt({ payment, items: group.items });
    load();
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

  if (loading) return <div className="empty-state">Memuat…</div>;

  const groups = groupByProvider(unpaidItems);
  const selectedGroup = groups.find((g) => g.providerId === selectedProviderId);

  return (
    <div>
      <div className="section-title">Provider dengan tagihan belum dibayar</div>

      {groups.length === 0 && (
        <div className="empty-state">Tidak ada tagihan yang belum dibayar. Lunas semua!</div>
      )}

      {groups.map((g) => (
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

      {payments.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 20 }}>
            Riwayat Pembayaran
          </div>
          {payments.map((p) => (
            <div className="list-row" key={p.id} onClick={() => reprintPayment(p)}>
              <div>
                <div className="name">{p.provider_name}</div>
                <div className="meta">{new Date(p.paid_at).toLocaleString("id-ID")}</div>
              </div>
              <div style={{ fontWeight: 700 }}>{formatRupiah(p.amount)}</div>
            </div>
          ))}
        </>
      )}

      {selectedGroup && (
        <div className="sheet-backdrop" onClick={() => setSelectedProviderId(undefined)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>{selectedGroup.providerName}</h2>
            {selectedGroup.items.map((it) => (
              <div className="list-row" key={it.id}>
                <div>
                  <div className="name">{it.product_name}</div>
                  <div className="meta">
                    {it.qty} × {formatRupiah(it.unit_cost)}
                  </div>
                </div>
                <div style={{ fontWeight: 700 }}>{formatRupiah(it.qty * it.unit_cost)}</div>
              </div>
            ))}
            <div className="list-row" style={{ background: "transparent", border: "none" }}>
              <div className="name">Total</div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>
                {formatRupiah(selectedGroup.total)}
              </div>
            </div>
            <div className="sheet-actions">
              <button className="btn-secondary" onClick={() => setSelectedProviderId(undefined)}>
                Batal
              </button>
              <button
                className="btn-primary"
                disabled={paying}
                onClick={() => payProvider(selectedGroup)}
              >
                {paying ? "Menyimpan…" : `Bayar ${formatRupiah(selectedGroup.total)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {receipt && (
        <Receipt
          payment={receipt.payment}
          items={receipt.items}
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  );
}
