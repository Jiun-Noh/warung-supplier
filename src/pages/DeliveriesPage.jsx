import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";
import { formatRupiah, todayISODate } from "../utils.js";

function addDays(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function groupByProvider(items) {
  const map = {};
  for (const item of items) {
    const key = item.provider_id || "none";
    if (!map[key]) {
      map[key] = { providerName: item.providers?.name || "Tanpa provider", items: [], total: 0 };
    }
    map[key].items.push(item);
    map[key].total += item.qty * (item.unit_cost || 0);
  }
  return Object.values(map);
}

function ComboSearch({ label, placeholder, options, getLabel, getSubLabel, selected, onSelect, onClear, emptyLabel }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  if (selected) {
    return (
      <div className="form-field">
        {label && <label>{label}</label>}
        <div className="combo-selected">
          <div>
            <div className="combo-selected-name">{getLabel(selected)}</div>
            {getSubLabel && <div className="combo-selected-sub">{getSubLabel(selected)}</div>}
          </div>
          <button type="button" className="btn-secondary" onClick={onClear}>
            Ganti
          </button>
        </div>
      </div>
    );
  }

  const filtered = (
    query.trim()
      ? options.filter((o) => getLabel(o).toLowerCase().includes(query.trim().toLowerCase()))
      : options
  ).slice(0, 8);

  return (
    <div className="form-field combo-field">
      {label && <label>{label}</label>}
      <input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div className="combo-dropdown">
          {filtered.length === 0 && <div className="combo-empty">{emptyLabel}</div>}
          {filtered.map((o) => (
            <div
              key={o.id}
              className="combo-option"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(o);
                setQuery("");
                setOpen(false);
              }}
            >
              <div>{getLabel(o)}</div>
              {getSubLabel && <div className="combo-option-sub">{getSubLabel(o)}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function emptyRow() {
  return { key: Math.random().toString(36).slice(2), product: null, qty: "", unitCost: "" };
}

function AddDeliverySheet({ date, providers, products, onSave, onClose, onToast }) {
  const [provider, setProvider] = useState(null);
  const [rows, setRows] = useState([emptyRow()]);
  const [saving, setSaving] = useState(false);

  const providerProducts = provider ? products.filter((p) => p.provider_id === provider.id) : [];

  function updateRow(key, patch) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((rs) => [...rs, emptyRow()]);
  }

  function removeRow(key) {
    setRows((rs) => (rs.length === 1 ? [emptyRow()] : rs.filter((r) => r.key !== key)));
  }

  async function handleSave() {
    const validRows = rows.filter((r) => r.product && Number(r.qty) > 0);
    if (validRows.length === 0) {
      onToast("Pilih barang dan isi jumlah dulu");
      return;
    }
    setSaving(true);
    const ok = await onSave(
      validRows.map((r) => ({ product: r.product, qty: Number(r.qty), unitCost: Number(r.unitCost) || 0 })),
      date
    );
    setSaving(false);
    if (!ok) return;
    onToast(`Penerimaan tersimpan · ${validRows.length} barang`);
    onClose();
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Catat Penerimaan · {date}</h2>

        <ComboSearch
          label="Provider"
          placeholder="Cari provider…"
          options={providers}
          getLabel={(p) => p.name}
          selected={provider}
          onSelect={(p) => {
            setProvider(p);
            setRows([emptyRow()]);
          }}
          onClear={() => {
            setProvider(null);
            setRows([emptyRow()]);
          }}
          emptyLabel="Provider tidak ditemukan"
        />

        {provider ? (
          <>
            {rows.map((row, idx) => {
              const usedIds = rows.filter((r) => r.key !== row.key && r.product).map((r) => r.product.id);
              const rowOptions = providerProducts.filter((p) => !usedIds.includes(p.id));
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
                        unitCost: p.net_price != null ? String(p.net_price) : "",
                      })
                    }
                    onClear={() => updateRow(row.key, { product: null, unitCost: "" })}
                    emptyLabel="Barang tidak ditemukan untuk provider ini"
                  />
                  <div className="form-row-split">
                    <div className="form-field">
                      <label>Jumlah</label>
                      <input
                        inputMode="numeric"
                        placeholder="0"
                        value={row.qty}
                        onChange={(e) => updateRow(row.key, { qty: e.target.value.replace(/[^0-9]/g, "") })}
                      />
                    </div>
                    <div className="form-field">
                      <label>Harga Modal (Rp)</label>
                      <input
                        inputMode="numeric"
                        placeholder="0"
                        value={row.unitCost}
                        onChange={(e) => updateRow(row.key, { unitCost: e.target.value.replace(/[^0-9]/g, "") })}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            <button className="btn-secondary" style={{ width: "100%", marginBottom: 14 }} onClick={addRow}>
              + Tambah Baris
            </button>
          </>
        ) : (
          <div className="empty-state" style={{ padding: "20px 4px" }}>
            Pilih provider dulu untuk memilih barang.
          </div>
        )}

        <div className="sheet-actions">
          <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>
            Batal
          </button>
          <button className="btn-primary" style={{ flex: 1 }} disabled={saving} onClick={handleSave}>
            {saving ? "Menyimpan…" : "Simpan Semua"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DeliveriesPage({ onToast }) {
  const [date, setDate] = useState(todayISODate());
  const [providers, setProviders] = useState([]);
  const [products, setProducts] = useState([]);
  const [dayItems, setDayItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    loadCatalog();
  }, []);

  useEffect(() => {
    loadDay(date);
  }, [date]);

  async function loadCatalog() {
    const [{ data: providerData, error: providerErr }, { data: productData, error: productErr }] =
      await Promise.all([
        supabase.from("providers").select("*").order("name", { ascending: true }),
        supabase
          .from("supplier_products")
          .select("*, providers(name)")
          .eq("active", true)
          .order("name", { ascending: true }),
      ]);
    if (providerErr) console.error(providerErr);
    if (productErr) console.error(productErr);
    setProviders(providerData || []);
    setProducts(productData || []);
  }

  async function loadDay(forDate) {
    setLoading(true);
    const { data, error } = await supabase
      .from("delivery_items")
      .select("*, providers(name)")
      .eq("delivery_date", forDate)
      .order("product_name", { ascending: true });
    if (error) console.error(error);
    setDayItems(data || []);
    setLoading(false);
  }

  async function saveItems(rows, deliveryDate) {
    const payload = rows.map(({ product, qty, unitCost }) => ({
      delivery_date: deliveryDate,
      provider_id: product.provider_id,
      supplier_product_id: product.id,
      product_name: product.name,
      qty,
      unit_cost: unitCost,
      due_date: addDays(deliveryDate, product.due_days || 1),
    }));
    const { error } = await supabase
      .from("delivery_items")
      .upsert(payload, { onConflict: "supplier_product_id,delivery_date" });
    if (error) {
      console.error(error);
      onToast("Gagal menyimpan");
      return false;
    }
    return true;
  }

  async function saveEditQty() {
    if (!editing) return;
    const qty = Number(editing.qty);
    if (!qty || qty <= 0) {
      onToast("Jumlah harus lebih dari 0");
      return;
    }
    const { error } = await supabase.from("delivery_items").update({ qty }).eq("id", editing.id);
    if (error) {
      console.error(error);
      onToast("Gagal menyimpan perubahan");
      return;
    }
    setEditing(null);
    onToast("Tersimpan");
    loadDay(date);
  }

  async function deleteItem(id) {
    const { error } = await supabase.from("delivery_items").delete().eq("id", id);
    if (error) {
      console.error(error);
      onToast("Gagal menghapus");
      return;
    }
    setEditing(null);
    onToast("Dihapus");
    loadDay(date);
  }

  if (providers.length === 0) {
    return (
      <div className="empty-state">
        Belum ada provider.
        <br />
        Tambahkan dulu di tab "Provider".
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="empty-state">
        Belum ada barang aktif.
        <br />
        Tambahkan dulu di tab "Barang".
      </div>
    );
  }

  const grouped = groupByProvider(dayItems);
  const grandTotal = dayItems.reduce((sum, it) => sum + it.qty * (it.unit_cost || 0), 0);

  return (
    <div>
      <input type="date" className="date-input" value={date} onChange={(e) => setDate(e.target.value)} />

      <button className="btn-primary" style={{ width: "100%", marginBottom: 14 }} onClick={() => setShowAdd(true)}>
        + Catat Penerimaan Baru
      </button>

      {loading ? (
        <div className="empty-state">Memuat…</div>
      ) : dayItems.length === 0 ? (
        <div className="empty-state">Belum ada barang yang dicatat untuk tanggal ini.</div>
      ) : (
        <>
          {grouped.map((g) => (
            <div className="category-block" key={g.providerName}>
              <div className="category-title">
                {g.providerName} · {formatRupiah(g.total)}
              </div>
              {g.items.map((it) => (
                <div className="list-row" key={it.id} onClick={() => setEditing({ ...it, qty: String(it.qty) })}>
                  <div>
                    <div className="name">{it.product_name}</div>
                    <div className="meta">
                      {it.qty} × {formatRupiah(it.unit_cost)} · Batas {it.due_date}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700 }}>{formatRupiah(it.qty * it.unit_cost)}</div>
                </div>
              ))}
            </div>
          ))}

          <div className="list-row" style={{ background: "transparent", border: "none" }}>
            <div className="name" style={{ fontWeight: 700 }}>
              Total
            </div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{formatRupiah(grandTotal)}</div>
          </div>
        </>
      )}

      {showAdd && (
        <AddDeliverySheet
          date={date}
          providers={providers}
          products={products}
          onSave={saveItems}
          onToast={onToast}
          onClose={() => {
            setShowAdd(false);
            loadDay(date);
          }}
        />
      )}

      {editing && (
        <div className="sheet-backdrop" onClick={() => setEditing(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>{editing.product_name}</h2>
            <div className="form-field">
              <label>Jumlah</label>
              <input
                inputMode="numeric"
                value={editing.qty}
                onChange={(e) => setEditing((f) => ({ ...f, qty: e.target.value.replace(/[^0-9]/g, "") }))}
              />
            </div>
            <div className="sheet-actions">
              <button className="btn-danger" onClick={() => deleteItem(editing.id)}>
                Hapus
              </button>
              <button className="btn-secondary" onClick={() => setEditing(null)}>
                Batal
              </button>
              <button className="btn-primary" onClick={saveEditQty}>
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
