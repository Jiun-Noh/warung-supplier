import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";
import { addDays, formatRupiah, todayISODate } from "../utils.js";
import {
  SHOP_NAME,
  SHOP_ADDRESS_LINE1,
  SHOP_ADDRESS_LINE2,
  SHOP_WHATSAPP,
  pickupDateTimeLabel,
  orderPrintUrl,
} from "../receipt.js";
import ComboSearch from "../ComboSearch.jsx";
import NumberStepper from "../NumberStepper.jsx";

function emptyOrderRow() {
  return {
    key: Math.random().toString(36).slice(2),
    product: null,
    qty: "",
    unitPrice: "",
  };
}

function AddOrderSheet({ products, defaultPickupDate, onSave, onSaved, onClose, onToast }) {
  const [customerName, setCustomerName] = useState("");
  const [pickupDate, setPickupDate] = useState(defaultPickupDate);
  const [pickupTime, setPickupTime] = useState("05:00");
  const [rows, setRows] = useState([emptyOrderRow()]);
  const [saving, setSaving] = useState(false);

  function updateRow(key, patch) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((rs) => [...rs, emptyOrderRow()]);
  }

  function removeRow(key) {
    setRows((rs) => (rs.length === 1 ? [emptyOrderRow()] : rs.filter((r) => r.key !== key)));
  }

  const grandTotal = rows.reduce((sum, r) => {
    if (!r.product) return sum;
    return sum + (Number(r.qty) || 0) * (Number(r.unitPrice) || 0);
  }, 0);

  async function handleSave() {
    if (!customerName.trim()) {
      onToast("Isi nama pemesan dulu");
      return;
    }
    if (!pickupDate) {
      onToast("Pilih tanggal pengambilan");
      return;
    }
    const validRows = rows.filter((r) => r.product && Number(r.qty) > 0);
    if (validRows.length === 0) {
      onToast("Pilih barang dan isi jumlah dulu");
      return;
    }

    setSaving(true);
    const result = await onSave({
      customerName: customerName.trim(),
      pickupDate,
      pickupTime,
      rows: validRows.map((r) => ({
        product: r.product,
        qty: Number(r.qty),
        unitPrice: Number(r.unitPrice) || 0,
      })),
    });
    setSaving(false);
    if (!result.ok) return;
    onToast(`Pesanan ${customerName.trim()} tersimpan`);
    onSaved(result.order, result.items);
    onClose();
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Pesanan Baru</h2>

        <div className="form-row-split">
          <div className="form-field">
            <label>Tanggal Ambil</label>
            <input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} />
          </div>
          <div className="form-field">
            <label>Jam Ambil</label>
            <input type="time" step="600" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} />
          </div>
        </div>
        <div className="form-field">
          <label>Nama Pemesan</label>
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Contoh: Salsa" />
        </div>

        {rows.map((row, idx) => {
          const usedIds = rows.filter((r) => r.key !== row.key && r.product).map((r) => r.product.id);
          const rowOptions = products.filter((p) => !usedIds.includes(p.id));
          const qty = Number(row.qty) || 0;
          const unitPrice = Number(row.unitPrice) || 0;
          const rowTotal = qty * unitPrice;
          return (
            <div className="delivery-row" key={row.key}>
              <div className="delivery-row-header">
                <span className="delivery-row-title">Barang {idx + 1}</span>
                <button
                  type="button"
                  className="delivery-row-remove"
                  onClick={() => removeRow(row.key)}
                  aria-label="Hapus baris"
                >
                  ✕
                </button>
              </div>
              <ComboSearch
                label="Barang"
                placeholder="Cari barang…"
                options={rowOptions}
                getLabel={(p) => p.name}
                getSubLabel={(p) => p.providers?.name || "Tanpa provider"}
                selected={row.product}
                onSelect={(p) =>
                  updateRow(row.key, {
                    product: p,
                    unitPrice:
                      p.gross_price != null ? String(p.gross_price) : p.net_price != null ? String(p.net_price) : "",
                  })
                }
                onClear={() => updateRow(row.key, { product: null, unitPrice: "" })}
                emptyLabel="Barang tidak ditemukan"
              />
              <div className="form-row-split">
                <div className="form-field">
                  <label>Jumlah</label>
                  <NumberStepper
                    step={1}
                    placeholder="0"
                    value={row.qty}
                    onChange={(v) => updateRow(row.key, { qty: v })}
                  />
                </div>
                <div className="form-field">
                  <label>Harga Jual (Rp)</label>
                  <NumberStepper
                    step={100}
                    placeholder="0"
                    value={row.unitPrice}
                    onChange={(v) => updateRow(row.key, { unitPrice: v })}
                  />
                </div>
              </div>
              {qty > 0 && unitPrice > 0 && (
                <div className="row-subtotal">
                  <div className="row-subtotal-total">
                    <span>Subtotal</span>
                    <span>{formatRupiah(rowTotal)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <button className="btn-secondary" style={{ width: "100%", marginBottom: 14 }} onClick={addRow}>
          + Tambah Baris
        </button>

        {grandTotal > 0 && (
          <div className="sheet-grand-total">
            <span>Total Pesanan</span>
            <span>{formatRupiah(grandTotal)}</span>
          </div>
        )}

        <div className="sheet-actions">
          <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>
            Batal
          </button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={saving} onClick={handleSave}>
            {saving ? "Menyimpan…" : "Simpan Pesanan"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderDetailSheet({ order, onClose, onDelete }) {
  const items = order.customer_order_items || [];
  const total = items.reduce((sum, it) => sum + it.qty * it.unit_price, 0);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{order.customer_name}</h2>
        <div className="meta" style={{ marginBottom: 10 }}>
          Ambil {order.pickup_date}
          {order.pickup_time ? ` · Jam ${order.pickup_time}` : ""}
        </div>
        {items.map((it) => (
          <div className="list-row" key={it.id}>
            <div>
              <div className="name">{it.product_name}</div>
              <div className="meta">
                {it.qty} × {formatRupiah(it.unit_price)}
                {it.providers?.name ? ` · ${it.providers.name}` : ""}
              </div>
            </div>
            <div style={{ fontWeight: 700 }}>{formatRupiah(it.qty * it.unit_price)}</div>
          </div>
        ))}
        <div className="list-row" style={{ background: "transparent", border: "none" }}>
          <div className="name" style={{ fontWeight: 700 }}>
            Total
          </div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{formatRupiah(total)}</div>
        </div>
        <div className="sheet-actions">
          <button className="btn-danger" onClick={() => onDelete(order)}>
            Hapus
          </button>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>
            Tutup
          </button>
          <a
            className="btn-primary"
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
            }}
            href={orderPrintUrl(order, items)}
          >
            Cetak
          </a>
        </div>
      </div>
    </div>
  );
}

function OrderReceipt({ order, items, onClose }) {
  const total = items.reduce((sum, it) => sum + it.qty * it.unit_price, 0);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet receipt-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="receipt-print">
          <div className="receipt-header">
            <div className="receipt-title">{SHOP_NAME}</div>
            <div>{SHOP_ADDRESS_LINE1}</div>
            <div>{SHOP_ADDRESS_LINE2}</div>
            <div>WA {SHOP_WHATSAPP}</div>
            <div style={{ marginTop: 6 }}>Struk Pesanan</div>
            <div>{order.customer_name}</div>
            <div>Ambil: {pickupDateTimeLabel(order)}</div>
          </div>
          <div className="receipt-items">
            {items.map((it, idx) => (
              <div className="receipt-item" key={it.id || idx}>
                <div className="receipt-item-row">
                  <div>{it.product_name}</div>
                  <div>{formatRupiah(it.qty * it.unit_price)}</div>
                </div>
                <div className="receipt-item-sub">
                  {it.qty} × {formatRupiah(it.unit_price)}
                </div>
              </div>
            ))}
          </div>
          <div className="receipt-total">
            <div>Total</div>
            <div>{formatRupiah(total)}</div>
          </div>
        </div>
        <div className="sheet-actions no-print">
          <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>
            Tutup
          </button>
          <a
            className="btn-primary"
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
            }}
            href={orderPrintUrl(order, items)}
            onClick={onClose}
          >
            Cetak
          </a>
        </div>
      </div>
    </div>
  );
}

export default function CustomerOrdersPage({ onToast }) {
  const [pickupDate, setPickupDate] = useState(addDays(todayISODate(), 1));
  const [products, setProducts] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [printPreview, setPrintPreview] = useState(null); // { order, items }
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadCatalog();
  }, []);

  useEffect(() => {
    loadOrders(pickupDate);
  }, [pickupDate]);

  async function loadCatalog() {
    setCatalogLoading(true);
    const { data, error } = await supabase
      .from("supplier_products")
      .select("*, providers(name)")
      .eq("active", true)
      .order("name", { ascending: true });
    if (error) console.error(error);
    setProducts(data || []);
    setCatalogLoading(false);
  }

  async function loadOrders(forDate) {
    setLoading(true);
    const { data, error } = await supabase
      .from("customer_orders")
      .select("*, customer_order_items(*, providers(name))")
      .eq("pickup_date", forDate)
      .order("pickup_time", { ascending: true });
    if (error) console.error(error);
    setOrders(data || []);
    setLoading(false);
  }

  async function saveOrder({ customerName, pickupDate: date, pickupTime, rows }) {
    const { data: order, error: orderError } = await supabase
      .from("customer_orders")
      .insert({ customer_name: customerName, pickup_date: date, pickup_time: pickupTime || null })
      .select()
      .single();
    if (orderError) {
      console.error(orderError);
      onToast("Gagal menyimpan pesanan");
      return { ok: false };
    }

    const payload = rows.map((r) => ({
      order_id: order.id,
      provider_id: r.product.provider_id,
      supplier_product_id: r.product.id,
      product_name: r.product.name,
      qty: r.qty,
      unit_price: r.unitPrice,
    }));
    const { error: itemsError } = await supabase.from("customer_order_items").insert(payload);
    if (itemsError) {
      console.error(itemsError);
      onToast("Pesanan dibuat tapi gagal menyimpan barang");
      return { ok: false };
    }

    return { ok: true, order, items: payload };
  }

  async function deleteOrder(order) {
    const { error } = await supabase.from("customer_orders").delete().eq("id", order.id);
    if (error) {
      console.error(error);
      onToast("Gagal menghapus pesanan");
      return;
    }
    onToast("Pesanan dihapus");
    setViewingOrder(null);
    loadOrders(pickupDate);
  }

  if (catalogLoading) return <div className="empty-state">Memuat…</div>;

  if (products.length === 0) {
    return (
      <div className="empty-state">
        Belum ada barang aktif.
        <br />
        Tambahkan dulu di tab "Barang".
      </div>
    );
  }

  const filteredOrders = search.trim()
    ? orders.filter((o) => o.customer_name.toLowerCase().includes(search.trim().toLowerCase()))
    : orders;
  const grandTotal = orders.reduce(
    (sum, o) => sum + (o.customer_order_items || []).reduce((s, it) => s + it.qty * it.unit_price, 0),
    0
  );

  return (
    <div>
      <input type="date" className="date-input" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} />

      <button className="btn-primary" style={{ width: "100%", marginBottom: 14 }} onClick={() => setShowAdd(true)}>
        + Pesanan Baru
      </button>

      {orders.length > 0 && (
        <input
          type="text"
          className="search-input"
          placeholder="Cari nama pemesan…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      {loading ? (
        <div className="empty-state">Memuat…</div>
      ) : orders.length === 0 ? (
        <div className="empty-state">Belum ada pesanan untuk tanggal ini.</div>
      ) : filteredOrders.length === 0 ? (
        <div className="empty-state">Tidak ada pemesan yang cocok dengan "{search}"</div>
      ) : (
        <>
          {filteredOrders.map((o) => {
            const total = (o.customer_order_items || []).reduce((s, it) => s + it.qty * it.unit_price, 0);
            return (
              <div className="list-row" key={o.id} onClick={() => setViewingOrder(o)}>
                <div>
                  <div className="name">{o.customer_name}</div>
                  <div className="meta">
                    {o.pickup_time ? `Jam ${o.pickup_time} · ` : ""}
                    {(o.customer_order_items || []).length} barang
                  </div>
                </div>
                <div style={{ fontWeight: 700 }}>{formatRupiah(total)}</div>
              </div>
            );
          })}

          <div className="list-row" style={{ background: "transparent", border: "none" }}>
            <div className="name" style={{ fontWeight: 700 }}>
              Total
            </div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{formatRupiah(grandTotal)}</div>
          </div>
        </>
      )}

      {showAdd && (
        <AddOrderSheet
          products={products}
          defaultPickupDate={pickupDate}
          onSave={saveOrder}
          onSaved={(order, items) => setPrintPreview({ order, items })}
          onToast={onToast}
          onClose={() => setShowAdd(false)}
        />
      )}

      {viewingOrder && (
        <OrderDetailSheet order={viewingOrder} onClose={() => setViewingOrder(null)} onDelete={deleteOrder} />
      )}

      {printPreview && (
        <OrderReceipt
          order={printPreview.order}
          items={printPreview.items}
          onClose={() => {
            setPrintPreview(null);
            loadOrders(pickupDate);
          }}
        />
      )}
    </div>
  );
}
