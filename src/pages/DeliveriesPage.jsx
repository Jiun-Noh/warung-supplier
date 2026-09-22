import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";
import { addDays, formatRupiah, todayISODate } from "../utils.js";
import { receiptPrintUrl } from "../receipt.js";
import ComboSearch from "../ComboSearch.jsx";
import NumberStepper from "../NumberStepper.jsx";

function groupByProvider(items) {
  const map = {};
  for (const item of items) {
    const key = item.provider_id || "none";
    if (!map[key]) {
      map[key] = {
        providerId: item.provider_id,
        providerName: item.providers?.name || "Tanpa provider",
        items: [],
        total: 0,
      };
    }
    map[key].items.push(item);
    map[key].total += item.qty * (item.unit_cost || 0);
  }
  return Object.values(map);
}

function emptyRow() {
  return {
    key: Math.random().toString(36).slice(2),
    product: null,
    qty: "",
    unitCost: "",
    discountQty: "",
    discountPrice: "",
    wasteQty: "",
    showAdjust: false,
  };
}

function rowFromExistingItem(item, products) {
  return {
    key: item.id,
    existingId: item.id,
    product: products.find((p) => p.id === item.supplier_product_id) || null,
    qty: String(item.qty),
    unitCost: String(item.unit_cost ?? ""),
  };
}

function AddDeliverySheet({
  date,
  providers,
  products,
  initialProvider,
  initialItems,
  excludedProviderIds,
  onSave,
  onSaveAndSettle,
  onDeleteExisting,
  onFetchLastDelivery,
  onClose,
  onToast,
}) {
  const isEditingExisting = Boolean(initialItems && initialItems.length > 0);
  const hasPaidItems = isEditingExisting && initialItems.some((it) => it.paid);
  const [provider, setProvider] = useState(initialProvider || null);
  const [rows, setRows] = useState(() =>
    isEditingExisting ? initialItems.map((it) => rowFromExistingItem(it, products)) : [emptyRow()]
  );
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [paidReceipt, setPaidReceipt] = useState(null); // { payment, items }

  const grandTotal = rows.reduce((sum, r) => {
    if (!r.product) return sum;
    const qty = Number(r.qty) || 0;
    const unitCost = Number(r.unitCost) || 0;
    if (isEditingExisting) return sum + qty * unitCost;
    const discountQty = Number(r.discountQty) || 0;
    const discountPrice = Number(r.discountPrice) || 0;
    const wasteQty = Number(r.wasteQty) || 0;
    const normalQty = Math.max(0, qty - discountQty - wasteQty);
    return sum + normalQty * unitCost + discountQty * discountPrice;
  }, 0);

  const providerOptions = providers.filter((p) => !excludedProviderIds.has(p.id));
  const providerProducts = provider
    ? products.filter((p) => p.provider_id === provider.id && p.active)
    : [];

  const productNamesByProvider = new Map();
  for (const p of products) {
    if (!p.provider_id) continue;
    if (!productNamesByProvider.has(p.provider_id)) productNamesByProvider.set(p.provider_id, []);
    productNamesByProvider.get(p.provider_id).push(p.name);
  }

  function updateRow(key, patch) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((rs) => [...rs, emptyRow()]);
  }

  async function removeRow(key) {
    const row = rows.find((r) => r.key === key);
    if (row?.existingId) {
      const ok = await onDeleteExisting(row.existingId);
      if (!ok) return;
    }
    setRows((rs) => (rs.length === 1 ? [emptyRow()] : rs.filter((r) => r.key !== key)));
  }

  async function copyLastDelivery() {
    if (!provider) return;
    setCopying(true);
    const items = await onFetchLastDelivery(provider.id);
    setCopying(false);

    if (items.length === 0) {
      onToast("Belum ada riwayat pengiriman sebelumnya untuk provider ini");
      return;
    }

    const newRows = items
      .map((it) => {
        const product = products.find((p) => p.id === it.supplier_product_id && p.active);
        if (!product) return null;
        return {
          key: Math.random().toString(36).slice(2),
          product,
          qty: String(it.qty),
          unitCost: product.net_price != null ? String(product.net_price) : "",
          discountQty: "",
          discountPrice: "",
          wasteQty: "",
          showAdjust: false,
        };
      })
      .filter(Boolean);

    if (newRows.length === 0) {
      onToast("Barang pada riwayat sebelumnya sudah tidak aktif");
      return;
    }

    setRows(newRows);
    onToast(`${newRows.length} barang disalin dari pengiriman sebelumnya`);
  }

  async function handleSave() {
    const validRows = rows.filter((r) => r.product && Number(r.qty) > 0);
    if (validRows.length === 0) {
      onToast("Pilih barang dan isi jumlah dulu");
      return;
    }

    if (isEditingExisting) {
      setSaving(true);
      const ok = await onSave(
        validRows.map((r) => ({ product: r.product, qty: Number(r.qty), unitCost: Number(r.unitCost) || 0 })),
        date
      );
      setSaving(false);
      if (!ok) return;
      onToast(`Penerimaan tersimpan · ${validRows.length} barang`);
      onClose();
      return;
    }

    const settleRows = validRows.map((r) => ({
      product: r.product,
      qty: Number(r.qty),
      unitCost: Number(r.unitCost) || 0,
      discountQty: Number(r.discountQty) || 0,
      discountPrice: Number(r.discountPrice) || 0,
      wasteQty: Number(r.wasteQty) || 0,
    }));
    const overLimitRow = settleRows.find((r) => r.discountQty + r.wasteQty > r.qty);
    if (overLimitRow) {
      onToast(`${overLimitRow.product.name}: diskon + rusak melebihi jumlah diterima`);
      return;
    }

    setSaving(true);
    const result = await onSaveAndSettle(settleRows, date, provider);
    setSaving(false);
    if (!result.ok) return;
    onToast(`Penerimaan tersimpan & siap dicetak · ${validRows.length} barang`);
    setPaidReceipt({ payment: result.payment, items: result.items });
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Catat Penerimaan · {date}</h2>

        {hasPaidItems && (
          <div className="row-warning" style={{ marginTop: -6 }}>
            Barang ini sudah dibayar. Untuk mengubah, batalkan dulu pembayarannya di tab Bayar.
          </div>
        )}

        <ComboSearch
          label="Provider"
          placeholder="Cari provider atau nama barang…"
          options={providerOptions}
          getLabel={(p) => p.name}
          getSearchText={(p) => [p.name, ...(productNamesByProvider.get(p.id) || [])].join(" ")}
          selected={provider}
          locked={isEditingExisting}
          onSelect={(p) => {
            setProvider(p);
            const provProducts = products.filter((prod) => prod.provider_id === p.id && prod.active);
            setRows(
              provProducts.length > 0
                ? provProducts.map((prod) => ({
                    key: Math.random().toString(36).slice(2),
                    product: prod,
                    qty: "",
                    unitCost: prod.net_price != null ? String(prod.net_price) : "",
                    discountQty: "",
                    discountPrice: "",
                    wasteQty: "",
                    showAdjust: false,
                  }))
                : [emptyRow()]
            );
          }}
          onClear={() => {
            setProvider(null);
            setRows([emptyRow()]);
          }}
          emptyLabel={
            providers.length > 0 && providerOptions.length === 0
              ? "Semua provider sudah dicatat untuk tanggal ini"
              : "Provider tidak ditemukan"
          }
        />

        {provider && !isEditingExisting && (
          <button
            type="button"
            className="btn-secondary"
            style={{ width: "100%", marginBottom: 14 }}
            disabled={copying}
            onClick={copyLastDelivery}
          >
            {copying ? "Menyalin…" : "↻ Salin Pengiriman Terakhir"}
          </button>
        )}

        {provider ? (
          <>
            {rows.map((row, idx) => {
              const usedIds = rows.filter((r) => r.key !== row.key && r.product).map((r) => r.product.id);
              const rowOptions = providerProducts.filter((p) => !usedIds.includes(p.id));
              return (
                <div className="delivery-row" key={row.key}>
                  <div className="delivery-row-header">
                    <span className="delivery-row-title">Barang {idx + 1}</span>
                    {!hasPaidItems && !paidReceipt && (
                      <button
                        type="button"
                        className="delivery-row-remove"
                        onClick={() => removeRow(row.key)}
                        aria-label="Hapus baris"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <ComboSearch
                    label="Barang"
                    placeholder="Cari barang…"
                    options={rowOptions}
                    getLabel={(p) => p.name}
                    getSubLabel={(p) => p.providers?.name || "Tanpa provider"}
                    selected={row.product}
                    locked={Boolean(row.existingId) || Boolean(paidReceipt) || hasPaidItems}
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
                      <NumberStepper
                        step={1}
                        placeholder="0"
                        disabled={Boolean(paidReceipt) || hasPaidItems}
                        value={row.qty}
                        onChange={(v) => updateRow(row.key, { qty: v })}
                      />
                    </div>
                    <div className="form-field">
                      <label>Harga Modal (Rp)</label>
                      <NumberStepper
                        step={100}
                        placeholder="0"
                        disabled={Boolean(paidReceipt) || hasPaidItems}
                        value={row.unitCost}
                        onChange={(v) => updateRow(row.key, { unitCost: v })}
                      />
                    </div>
                  </div>

                  {!isEditingExisting &&
                    (() => {
                      const qty = Number(row.qty) || 0;
                      const unitCost = Number(row.unitCost) || 0;
                      const discountQty = Number(row.discountQty) || 0;
                      const discountPrice = Number(row.discountPrice) || 0;
                      const wasteQty = Number(row.wasteQty) || 0;
                      const rowOverLimit = discountQty + wasteQty > qty;
                      const normalQty = Math.max(0, qty - discountQty - wasteQty);
                      const rowTotal = normalQty * unitCost + discountQty * discountPrice;
                      return (
                        <>
                          
                          <button
                            type="button"
                            className="row-toggle"
                            disabled={Boolean(paidReceipt)}
                            onClick={() => updateRow(row.key, { showAdjust: !row.showAdjust })}
                          >
                            {row.showAdjust ? "− Sembunyikan diskon/rusak" : "+ Ada diskon/rusak hari ini?"}
                          </button>
                          {row.showAdjust && (
                            <>
                              <div className="form-row-split">
                                <div className="form-field">
                                  <label>Jumlah Diskon</label>
                                  <NumberStepper
                                    step={1}
                                    placeholder="0"
                                    disabled={Boolean(paidReceipt)}
                                    value={row.discountQty}
                                    onChange={(v) => updateRow(row.key, { discountQty: v })}
                                  />
                                </div>
                                <div className="form-field">
                                  <label>Harga Diskon (Rp)</label>
                                  <NumberStepper
                                    step={100}
                                    placeholder={row.unitCost || "0"}
                                    disabled={Boolean(paidReceipt)}
                                    value={row.discountPrice}
                                    onChange={(v) => updateRow(row.key, { discountPrice: v })}
                                  />
                                </div>
                              </div>
                              <div className="form-field">
                                <label>Jumlah Rusak / Dibuang</label>
                                <NumberStepper
                                  step={1}
                                  placeholder="0"
                                  disabled={Boolean(paidReceipt)}
                                  value={row.wasteQty}
                                  onChange={(v) => updateRow(row.key, { wasteQty: v })}
                                />
                              </div>
                              {rowOverLimit && (
                                <div className="row-warning">
                                  Diskon + rusak ({discountQty + wasteQty}) melebihi jumlah diterima ({qty})
                                </div>
                              )}
                            </>
                          )}
                          {qty > 0 && (
                            <div className="row-subtotal">
                              <div className="row-subtotal-lines">
                                <div className="row-subtotal-line">
                                  <span>
                                    {normalQty} × {formatRupiah(unitCost)}
                                  </span>
                                  <span>{formatRupiah(normalQty * unitCost)}</span>
                                </div>
                                {discountQty > 0 && (
                                  <div className="row-subtotal-line">
                                    <span>Diskon {discountQty} × {formatRupiah(discountPrice)}</span>
                                    <span>{formatRupiah(discountQty * discountPrice)}</span>
                                  </div>
                                )}
                                {wasteQty > 0 && (
                                  <div className="row-subtotal-line row-subtotal-muted">
                                    <span>Rusak/dibuang {wasteQty} (tidak dihitung)</span>
                                    <span>—</span>
                                  </div>
                                )}
                              </div>
                              <div className="row-subtotal-total">
                                <span>Subtotal</span>
                                <span>{formatRupiah(rowTotal)}</span>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                </div>
              );
            })}

            {!paidReceipt && !hasPaidItems && (
              <button className="btn-secondary" style={{ width: "100%", marginBottom: 14 }} onClick={addRow}>
                + Tambah Baris
              </button>
            )}
          </>
        ) : (
          <div className="empty-state" style={{ padding: "20px 4px" }}>
            Pilih provider dulu untuk memilih barang.
          </div>
        )}

        {provider && grandTotal > 0 && (
          <div className="sheet-grand-total">
            <span>Total Semua Barang</span>
            <span>{formatRupiah(grandTotal)}</span>
          </div>
        )}

        <div className="sheet-actions">
          {paidReceipt ? (
            <>
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
                href={receiptPrintUrl(paidReceipt.payment, paidReceipt.items)}
                onClick={onClose}
              >
                Cetak
              </a>
            </>
          ) : (
            <>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>
                {hasPaidItems ? "Tutup" : "Batal"}
              </button>
              {!hasPaidItems && (
                <button className="btn-primary" style={{ flex: 1 }} disabled={saving} onClick={handleSave}>
                  {saving ? "Menyimpan…" : isEditingExisting ? "Simpan Semua" : "Simpan & Cetak"}
                </button>
              )}
            </>
          )}
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
  const [addProvider, setAddProvider] = useState(null);
  const [addInitialItems, setAddInitialItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");

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

  async function saveAndSettleItems(rows, deliveryDate, provider) {
    const amount = rows.reduce((sum, r) => {
      const normalQty = r.qty - r.discountQty - r.wasteQty;
      return sum + normalQty * r.unitCost + r.discountQty * r.discountPrice;
    }, 0);

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({ provider_id: provider.id, provider_name: provider.name, amount })
      .select()
      .single();
    if (paymentError) {
      console.error(paymentError);
      onToast("Gagal membuat pembayaran");
      return { ok: false };
    }

    const payload = rows.map((r) => ({
      delivery_date: deliveryDate,
      provider_id: r.product.provider_id,
      supplier_product_id: r.product.id,
      product_name: r.product.name,
      qty: r.qty,
      unit_cost: r.unitCost,
      due_date: addDays(deliveryDate, r.product.due_days || 1),
      discount_qty: r.discountQty,
      discount_price: r.discountQty > 0 ? r.discountPrice : null,
      waste_qty: r.wasteQty,
      paid: true,
      payment_id: payment.id,
    }));
    const { error } = await supabase
      .from("delivery_items")
      .upsert(payload, { onConflict: "supplier_product_id,delivery_date" });
    if (error) {
      console.error(error);
      onToast("Gagal menyimpan");
      return { ok: false };
    }

    return { ok: true, payment, items: payload };
  }

  async function saveEdit() {
    if (!editing) return;
    const qty = Number(editing.qty);
    if (!qty || qty <= 0) {
      onToast("Jumlah harus lebih dari 0");
      return;
    }
    const unitCost = Number(editing.unitCost) || 0;
    const { error } = await supabase
      .from("delivery_items")
      .update({ qty, unit_cost: unitCost })
      .eq("id", editing.id);
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

  async function deleteDeliveryItem(id) {
    const { error } = await supabase.from("delivery_items").delete().eq("id", id);
    if (error) {
      console.error(error);
      onToast("Gagal menghapus");
      return false;
    }
    onToast("Dihapus");
    return true;
  }

  async function fetchLastDelivery(providerId) {
    const { data, error } = await supabase
      .from("delivery_items")
      .select("supplier_product_id, qty, delivery_date")
      .eq("provider_id", providerId)
      .lt("delivery_date", date)
      .order("delivery_date", { ascending: false })
      .limit(50);
    if (error) {
      console.error(error);
      onToast("Gagal memuat riwayat");
      return [];
    }
    if (!data || data.length === 0) return [];
    const lastDate = data[0].delivery_date;
    return data.filter((d) => d.delivery_date === lastDate);
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

  if (products.filter((p) => p.active).length === 0) {
    return (
      <div className="empty-state">
        Belum ada barang aktif.
        <br />
        Tambahkan dulu di tab "Barang".
      </div>
    );
  }

  const grouped = groupByProvider(dayItems);
  const filteredGrouped = search.trim()
    ? grouped.filter((g) => g.providerName.toLowerCase().includes(search.trim().toLowerCase()))
    : grouped;
  const grandTotal = dayItems.reduce((sum, it) => sum + it.qty * (it.unit_cost || 0), 0);
  const excludedProviderIds = new Set(dayItems.map((it) => it.provider_id).filter(Boolean));

  function openAddSheet(provider, items = []) {
    setAddProvider(provider || null);
    setAddInitialItems(items);
    setShowAdd(true);
  }

  return (
    <div>
      <input type="date" className="date-input" value={date} onChange={(e) => setDate(e.target.value)} />

      <button className="btn-primary" style={{ width: "100%", marginBottom: 14 }} onClick={() => openAddSheet(null)}>
        + Catat Penerimaan Baru
      </button>

      {dayItems.length > 0 && (
        <input
          type="text"
          className="search-input"
          placeholder="Cari provider…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      {loading ? (
        <div className="empty-state">Memuat…</div>
      ) : dayItems.length === 0 ? (
        <div className="empty-state">Belum ada barang yang dicatat untuk tanggal ini.</div>
      ) : filteredGrouped.length === 0 ? (
        <div className="empty-state">Tidak ada provider yang cocok dengan "{search}"</div>
      ) : (
        <>
          {filteredGrouped.map((g) =>
            g.providerId ? (
              <div
                className="list-row"
                key={g.providerId}
                onClick={() => openAddSheet(providers.find((p) => p.id === g.providerId), g.items)}
              >
                <div>
                  <div className="name">{g.providerName}</div>
                  <div className="meta">{g.items.length} barang</div>
                </div>
                <div style={{ fontWeight: 700 }}>{formatRupiah(g.total)}</div>
              </div>
            ) : (
              <div className="category-block" key="none">
                <div className="category-title">
                  {g.providerName} · {formatRupiah(g.total)}
                </div>
                {g.items.map((it) => (
                  <div
                    className="list-row"
                    key={it.id}
                    onClick={() =>
                      setEditing({ ...it, qty: String(it.qty), unitCost: String(it.unit_cost ?? "") })
                    }
                  >
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
            )
          )}

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
          initialProvider={addProvider}
          initialItems={addInitialItems}
          excludedProviderIds={excludedProviderIds}
          onSave={saveItems}
          onSaveAndSettle={saveAndSettleItems}
          onDeleteExisting={deleteDeliveryItem}
          onFetchLastDelivery={fetchLastDelivery}
          onToast={onToast}
          onClose={() => {
            setShowAdd(false);
            setAddProvider(null);
            setAddInitialItems([]);
            loadDay(date);
          }}
        />
      )}

      {editing && (
        <div className="sheet-backdrop" onClick={() => setEditing(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>{editing.product_name}</h2>
            <div className="form-row-split">
              <div className="form-field">
                <label>Jumlah</label>
                <NumberStepper step={1} value={editing.qty} onChange={(v) => setEditing((f) => ({ ...f, qty: v }))} />
              </div>
              <div className="form-field">
                <label>Harga Modal (Rp)</label>
                <NumberStepper
                  step={100}
                  value={editing.unitCost}
                  onChange={(v) => setEditing((f) => ({ ...f, unitCost: v }))}
                />
              </div>
            </div>
            <div className="sheet-actions">
              <button className="btn-danger" onClick={() => deleteItem(editing.id)}>
                Hapus
              </button>
              <button className="btn-secondary" onClick={() => setEditing(null)}>
                Batal
              </button>
              <button className="btn-primary" onClick={saveEdit}>
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
