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

const ORDER_DRAFT_KEY = "warung_order_draft";

function loadOrderDraft() {
  try {
    const raw = localStorage.getItem(ORDER_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveOrderDraft(draft) {
  try {
    localStorage.setItem(ORDER_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}

function clearOrderDraft() {
  try {
    localStorage.removeItem(ORDER_DRAFT_KEY);
  } catch {
    // ignore
  }
}

function rowFromOrderItem(item, products) {
  return {
    key: item.id,
    existingId: item.id,
    product: products.find((p) => p.id === item.supplier_product_id) || {
      id: item.supplier_product_id,
      name: item.product_name,
      provider_id: item.provider_id,
      providers: item.providers,
    },
    qty: String(item.qty),
    unitPrice: String(item.unit_price),
  };
}

function AddOrderSheet({ products, customers, defaultPickupDate, initialOrder, onSave, onSaved, onClose, onToast }) {
  const isEditing = Boolean(initialOrder);
  const [draft] = useState(() => (isEditing ? null : loadOrderDraft()));
  const [customerName, setCustomerName] = useState(initialOrder?.customer_name ?? draft?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(initialOrder?.customer_phone ?? draft?.customerPhone ?? "");
  const [pickupDate, setPickupDate] = useState(initialOrder?.pickup_date ?? draft?.pickupDate ?? defaultPickupDate);
  const [pickupTime, setPickupTime] = useState(initialOrder?.pickup_time ?? draft?.pickupTime ?? "05:00");
  const [rows, setRows] = useState(() => {
    const existingItems = initialOrder?.customer_order_items;
    if (existingItems && existingItems.length > 0) {
      return existingItems.map((it) => rowFromOrderItem(it, products));
    }
    return draft?.rows?.length ? draft.rows : [emptyOrderRow()];
  });
  const [saving, setSaving] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);

  const nameQuery = customerName.trim().toLowerCase();
  const nameMatches = customers.filter((c) => !nameQuery || c.name.toLowerCase().includes(nameQuery)).slice(0, 50);

  useEffect(() => {
    if (isEditing) return;
    if (draft && (draft.customerName || (draft.rows || []).some((r) => r.product))) {
      onToast("Pesanan yang belum tersimpan dipulihkan");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isEditing) return;
    saveOrderDraft({ customerName, customerPhone, pickupDate, pickupTime, rows });
  }, [isEditing, customerName, customerPhone, pickupDate, pickupTime, rows]);

  function handleClose() {
    if (!isEditing) clearOrderDraft();
    onClose();
  }

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
      orderId: initialOrder?.id ?? null,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
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
    onToast(isEditing ? "Perubahan tersimpan" : `Pesanan ${customerName.trim()} tersimpan`);
    onSaved(result.order, result.items);
    if (!isEditing) clearOrderDraft();
    onClose();
  }

  return (
    <div className="sheet-backdrop" onClick={handleClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{isEditing ? "Edit Pesanan" : "Pesanan Baru"}</h2>

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
        <div className="form-row-split">
          <div className="form-field combo-field">
            <label>Nama Pemesan</label>
            <input
              autoComplete="off"
              value={customerName}
              onChange={(e) => {
                const value = e.target.value;
                setCustomerName(value);
                setNameOpen(true);
                const match = customers.find(
                  (c) => c.name.trim().toLowerCase() === value.trim().toLowerCase()
                );
                if (match) setCustomerPhone(match.phone || "");
              }}
              onFocus={() => setNameOpen(true)}
              onBlur={() => setTimeout(() => setNameOpen(false), 150)}
              placeholder="Contoh: Salsa"
            />
            {nameOpen && nameMatches.length > 0 && (
              <div className="combo-dropdown">
                {nameMatches.map((c) => (
                  <div
                    key={c.id}
                    className="combo-option"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setCustomerName(c.name);
                      setCustomerPhone(c.phone || "");
                      setNameOpen(false);
                    }}
                  >
                    <div>{c.name}</div>
                    {c.phone && <div className="combo-option-sub">{c.phone}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="form-field">
            <label>No. HP</label>
            <input
              inputMode="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="0812xxxxxxx"
            />
          </div>
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
          <button className="btn-secondary" style={{ flex: 1 }} onClick={handleClose}>
            Batal
          </button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={saving} onClick={handleSave}>
            {saving ? "Menyimpan…" : isEditing ? "Simpan Perubahan" : "Simpan Pesanan"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderDetailSheet({ order, onClose, onEdit, onDelete }) {
  const items = order.customer_order_items || [];
  const total = items.reduce((sum, it) => sum + it.qty * it.unit_price, 0);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{order.customer_name}</h2>
        <div className="meta" style={{ marginBottom: 10 }}>
          Ambil {order.pickup_date}
          {order.pickup_time ? ` · Jam ${order.pickup_time}` : ""}
          {order.customer_phone ? ` · ${order.customer_phone}` : ""}
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

        <button className="btn-primary" style={{ width: "100%", marginBottom: 14 }} onClick={() => onEdit(order)}>
          Edit Pesanan
        </button>

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
            {order.customer_phone && <div>{order.customer_phone}</div>}
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
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [editOrder, setEditOrder] = useState(null);
  const [printPreview, setPrintPreview] = useState(null); // { order, items }
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadCatalog();
    loadCustomers();
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

  async function loadCustomers() {
    const { data, error } = await supabase
      .from("customer_orders")
      .select("customer_name, customer_phone")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) console.error(error);
    const byName = new Map();
    for (const o of data || []) {
      const name = o.customer_name.trim();
      const key = name.toLowerCase();
      const existing = byName.get(key);
      if (!existing) byName.set(key, { id: key, name, phone: o.customer_phone || "" });
      else if (!existing.phone && o.customer_phone) existing.phone = o.customer_phone;
    }
    setCustomers([...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "id", { sensitivity: "base" })));
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

  async function saveOrder({ orderId, customerName, customerPhone, pickupDate: date, pickupTime, rows }) {
    const orderFields = {
      customer_name: customerName,
      customer_phone: customerPhone || null,
      pickup_date: date,
      pickup_time: pickupTime || null,
    };

    let order;
    if (orderId) {
      const { data, error } = await supabase
        .from("customer_orders")
        .update(orderFields)
        .eq("id", orderId)
        .select()
        .single();
      if (error) {
        console.error(error);
        onToast("Gagal menyimpan perubahan");
        return { ok: false };
      }
      order = data;

      const { error: deleteError } = await supabase.from("customer_order_items").delete().eq("order_id", orderId);
      if (deleteError) {
        console.error(deleteError);
        onToast("Gagal memperbarui barang pesanan");
        return { ok: false };
      }
    } else {
      const { data, error } = await supabase.from("customer_orders").insert(orderFields).select().single();
      if (error) {
        console.error(error);
        onToast("Gagal menyimpan pesanan");
        return { ok: false };
      }
      order = data;
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
      onToast(orderId ? "Perubahan tersimpan sebagian, barang gagal disimpan" : "Pesanan dibuat tapi gagal menyimpan barang");
      return { ok: false };
    }

    loadOrders(pickupDate);
    loadCustomers();
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
          customers={customers}
          defaultPickupDate={pickupDate}
          onSave={saveOrder}
          onSaved={(order, items) => setPrintPreview({ order, items })}
          onToast={onToast}
          onClose={() => setShowAdd(false)}
        />
      )}

      {viewingOrder && (
        <OrderDetailSheet
          order={viewingOrder}
          onClose={() => setViewingOrder(null)}
          onEdit={(order) => {
            setViewingOrder(null);
            setEditOrder(order);
          }}
          onDelete={deleteOrder}
        />
      )}

      {editOrder && (
        <AddOrderSheet
          products={products}
          customers={customers}
          defaultPickupDate={pickupDate}
          initialOrder={editOrder}
          onSave={saveOrder}
          onSaved={(order, items) => setPrintPreview({ order, items })}
          onToast={onToast}
          onClose={() => setEditOrder(null)}
        />
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
