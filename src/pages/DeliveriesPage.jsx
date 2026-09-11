import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";
import { todayISODate } from "../utils.js";

function addDays(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function groupByProvider(items) {
  const map = {};
  for (const item of items) {
    const key = item.providers?.name || "Tanpa provider";
    (map[key] ??= []).push(item);
  }
  return map;
}

export default function DeliveriesPage({ onToast }) {
  const [products, setProducts] = useState([]);
  const [inputs, setInputs] = useState({}); // supplierProductId -> string
  const [savedInputs, setSavedInputs] = useState({});
  const [rowStatus, setRowStatus] = useState({}); // supplierProductId -> "saving" | "saved" | "error"
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const today = todayISODate();
    const [{ data: productData, error: productErr }, { data: deliveryData, error: deliveryErr }] =
      await Promise.all([
        supabase
          .from("supplier_products")
          .select("*, providers(name)")
          .eq("active", true)
          .order("name", { ascending: true }),
        supabase.from("delivery_items").select("*").eq("delivery_date", today),
      ]);
    if (productErr) console.error(productErr);
    if (deliveryErr) console.error(deliveryErr);

    const deliveryMap = {};
    (deliveryData || []).forEach((d) => {
      if (d.supplier_product_id) deliveryMap[d.supplier_product_id] = d;
    });

    const initialInputs = {};
    (productData || []).forEach((p) => {
      const row = deliveryMap[p.id];
      initialInputs[p.id] = row ? String(row.qty) : "";
    });

    setProducts(productData || []);
    setInputs(initialInputs);
    setSavedInputs(initialInputs);
    setRowStatus({});
    setLoading(false);
  }

  function setQty(productId, value) {
    const cleaned = value.replace(/[^0-9]/g, "");
    setInputs((s) => ({ ...s, [productId]: cleaned }));
  }

  async function saveOne(productId) {
    const raw = inputs[productId] ?? "";
    if (raw === "" || raw === savedInputs[productId]) return;

    const product = products.find((p) => p.id === productId);
    if (!product) return;

    setRowStatus((s) => ({ ...s, [productId]: "saving" }));
    const today = todayISODate();
    const { error } = await supabase.from("delivery_items").upsert(
      [
        {
          delivery_date: today,
          provider_id: product.provider_id,
          supplier_product_id: product.id,
          product_name: product.name,
          qty: Number(raw),
          unit_cost: product.net_price || 0,
          due_date: addDays(today, product.due_days || 1),
        },
      ],
      { onConflict: "supplier_product_id,delivery_date" }
    );

    if (error) {
      console.error(error);
      setRowStatus((s) => ({ ...s, [productId]: "error" }));
      onToast("Gagal menyimpan otomatis");
      return;
    }

    setSavedInputs((s) => ({ ...s, [productId]: raw }));
    setRowStatus((s) => ({ ...s, [productId]: "saved" }));
    setTimeout(() => {
      setRowStatus((s) => {
        if (s[productId] !== "saved") return s;
        const next = { ...s };
        delete next[productId];
        return next;
      });
    }, 1200);
  }

  async function saveAll() {
    const today = todayISODate();
    const rows = products
      .filter((p) => inputs[p.id] !== "" && inputs[p.id] !== undefined)
      .map((p) => ({
        delivery_date: today,
        provider_id: p.provider_id,
        supplier_product_id: p.id,
        product_name: p.name,
        qty: Number(inputs[p.id]),
        unit_cost: p.net_price || 0,
        due_date: addDays(today, p.due_days || 1),
      }));

    if (rows.length === 0) {
      onToast("Isi jumlah barang yang diterima dulu");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("delivery_items")
      .upsert(rows, { onConflict: "supplier_product_id,delivery_date" });
    setSaving(false);

    if (error) {
      console.error(error);
      onToast("Gagal menyimpan");
      return;
    }
    onToast(`Penerimaan tersimpan · ${rows.length} barang`);
    load();
  }

  if (loading) return <div className="empty-state">Memuat…</div>;

  if (products.length === 0) {
    return (
      <div className="empty-state">
        Belum ada barang aktif.
        <br />
        Tambahkan dulu di tab "Barang".
      </div>
    );
  }

  const filteredProducts = search.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    : products;
  const grouped = groupByProvider(filteredProducts);

  return (
    <div>
      <div className="section-title">Catat barang yang diterima dari provider pagi ini</div>

      <input
        type="text"
        className="search-input"
        placeholder="Cari barang…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {filteredProducts.length === 0 && (
        <div className="empty-state">Tidak ada barang yang cocok dengan "{search}"</div>
      )}

      {Object.entries(grouped).map(([providerName, items]) => (
        <div className="category-block" key={providerName}>
          <div className="category-title">{providerName}</div>
          {items.map((p) => (
            <div className="stock-row" key={p.id}>
              <div>
                <div className="name">{p.name}</div>
                <div className="hint">Batas jual: {p.due_days} hari</div>
              </div>
              <div className="inputs">
                <div className="qty-field">
                  <label>Jumlah</label>
                  <input
                    className={
                      "qty-input" +
                      (rowStatus[p.id] === "saved" ? " qty-input-saved" : "") +
                      (rowStatus[p.id] === "error" ? " qty-input-error" : "")
                    }
                    inputMode="numeric"
                    placeholder="0"
                    value={inputs[p.id] || ""}
                    onChange={(e) => setQty(p.id, e.target.value)}
                    onBlur={() => saveOne(p.id)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}

      <div className="sticky-save">
        <button className="btn-primary" style={{ width: "100%" }} disabled={saving} onClick={saveAll}>
          {saving ? "Menyimpan…" : "Simpan Semua Penerimaan"}
        </button>
      </div>
    </div>
  );
}
