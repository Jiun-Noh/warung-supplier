import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";
import { formatRupiah } from "../utils.js";

const emptyForm = {
  provider_id: "",
  name: "",
  category: "",
  net_price: "",
  gross_price: "",
  due_days: "1",
};

export default function SupplierProductsPage({ onToast }) {
  const [products, setProducts] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: productData, error: productErr }, { data: providerData, error: providerErr }] =
      await Promise.all([
        supabase
          .from("supplier_products")
          .select("*, providers(name)")
          .order("name", { ascending: true }),
        supabase.from("providers").select("*").order("name", { ascending: true }),
      ]);
    if (productErr) console.error(productErr);
    if (providerErr) console.error(providerErr);
    setProducts(productData || []);
    setProviders(providerData || []);
    setLoading(false);
  }

  async function addProduct() {
    if (!form.name.trim()) {
      onToast("Isi nama barang dulu");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("supplier_products").insert({
      provider_id: form.provider_id || null,
      name: form.name.trim(),
      category: form.category.trim() || null,
      net_price: form.net_price === "" ? null : Number(form.net_price),
      gross_price: form.gross_price === "" ? null : Number(form.gross_price),
      due_days: Number(form.due_days || 1),
    });
    setSaving(false);
    if (error) {
      console.error(error);
      onToast("Gagal menambahkan");
      return;
    }
    setForm(emptyForm);
    setShowAdd(false);
    onToast("Barang ditambahkan");
    load();
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editing.name.trim()) {
      onToast("Nama barang tidak boleh kosong");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("supplier_products")
      .update({
        provider_id: editing.provider_id || null,
        name: editing.name.trim(),
        category: editing.category?.trim() || null,
        net_price: editing.net_price === "" ? null : Number(editing.net_price),
        gross_price: editing.gross_price === "" ? null : Number(editing.gross_price),
        due_days: Number(editing.due_days || 1),
      })
      .eq("id", editing.id);
    setSaving(false);
    if (error) {
      console.error(error);
      onToast("Gagal menyimpan perubahan");
      return;
    }
    setEditing(null);
    onToast("Tersimpan");
    load();
  }

  async function toggleActive(product) {
    const { error } = await supabase
      .from("supplier_products")
      .update({ active: !product.active })
      .eq("id", product.id);
    if (error) {
      console.error(error);
      onToast("Gagal mengubah");
      return;
    }
    load();
  }

  if (loading) return <div className="empty-state">Memuat…</div>;

  const filteredProducts = search.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    : products;

  return (
    <div>
      {providers.length === 0 ? (
        <div className="empty-state">
          Belum ada provider.
          <br />
          Tambahkan dulu di tab "Provider".
        </div>
      ) : (
        <>
          <button
            className="btn-primary"
            style={{ width: "100%", marginBottom: 14 }}
            onClick={() => setShowAdd(true)}
          >
            + Tambah Barang Baru
          </button>

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

          {filteredProducts.map((p) => (
            <div
              className="list-row"
              key={p.id}
              style={{ opacity: p.active ? 1 : 0.5 }}
              onClick={() =>
                setEditing({
                  ...p,
                  net_price: p.net_price ?? "",
                  gross_price: p.gross_price ?? "",
                  category: p.category ?? "",
                  provider_id: p.provider_id ?? "",
                })
              }
            >
              <div>
                <div className="name">{p.name}</div>
                <div className="meta">
                  {p.providers?.name || "Tanpa provider"}
                  {p.category && ` · ${p.category}`}
                  {p.gross_price != null && ` · Jual ${formatRupiah(p.gross_price)}`}
                  {p.net_price != null && ` · Modal ${formatRupiah(p.net_price)}`}
                  {` · ${p.due_days} hari`}
                  {!p.active && " · Nonaktif"}
                </div>
              </div>
              <button
                className="btn-secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleActive(p);
                }}
              >
                {p.active ? "Sembunyikan" : "Aktifkan"}
              </button>
            </div>
          ))}
        </>
      )}

      {showAdd && (
        <div className="sheet-backdrop" onClick={() => setShowAdd(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Tambah Barang Baru</h2>
            <div className="form-field">
              <label>Provider</label>
              <select
                value={form.provider_id}
                onChange={(e) => setForm((f) => ({ ...f, provider_id: e.target.value }))}
              >
                <option value="">Tanpa provider</option>
                {providers.map((prov) => (
                  <option key={prov.id} value={prov.id}>
                    {prov.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Nama Barang</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Contoh: Kue Lapis"
              />
            </div>
            <div className="form-field">
              <label>Kategori (opsional)</label>
              <input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="Contoh: Kue Basah"
              />
            </div>
            <div className="form-row-split">
              <div className="form-field">
                <label>Harga Modal (Rp)</label>
                <input
                  inputMode="numeric"
                  value={form.net_price}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, net_price: e.target.value.replace(/[^0-9]/g, "") }))
                  }
                  placeholder="800"
                />
              </div>
              <div className="form-field">
                <label>Harga Jual (Rp)</label>
                <input
                  inputMode="numeric"
                  value={form.gross_price}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, gross_price: e.target.value.replace(/[^0-9]/g, "") }))
                  }
                  placeholder="1000"
                />
              </div>
            </div>
            <div className="form-field">
              <label>Batas Jual (hari sejak diterima)</label>
              <input
                inputMode="numeric"
                value={form.due_days}
                onChange={(e) =>
                  setForm((f) => ({ ...f, due_days: e.target.value.replace(/[^0-9]/g, "") }))
                }
                placeholder="1"
              />
            </div>
            <div className="sheet-actions">
              <button className="btn-secondary" onClick={() => setShowAdd(false)}>
                Batal
              </button>
              <button className="btn-primary" disabled={saving} onClick={addProduct}>
                {saving ? "Menyimpan…" : "Tambah"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="sheet-backdrop" onClick={() => setEditing(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Barang</h2>
            <div className="form-field">
              <label>Provider</label>
              <select
                value={editing.provider_id}
                onChange={(e) => setEditing((f) => ({ ...f, provider_id: e.target.value }))}
              >
                <option value="">Tanpa provider</option>
                {providers.map((prov) => (
                  <option key={prov.id} value={prov.id}>
                    {prov.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Nama Barang</label>
              <input
                value={editing.name}
                onChange={(e) => setEditing((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="form-field">
              <label>Kategori (opsional)</label>
              <input
                value={editing.category}
                onChange={(e) => setEditing((f) => ({ ...f, category: e.target.value }))}
              />
            </div>
            <div className="form-row-split">
              <div className="form-field">
                <label>Harga Modal (Rp)</label>
                <input
                  inputMode="numeric"
                  value={editing.net_price}
                  onChange={(e) =>
                    setEditing((f) => ({
                      ...f,
                      net_price: e.target.value.replace(/[^0-9]/g, ""),
                    }))
                  }
                />
              </div>
              <div className="form-field">
                <label>Harga Jual (Rp)</label>
                <input
                  inputMode="numeric"
                  value={editing.gross_price}
                  onChange={(e) =>
                    setEditing((f) => ({
                      ...f,
                      gross_price: e.target.value.replace(/[^0-9]/g, ""),
                    }))
                  }
                />
              </div>
            </div>
            <div className="form-field">
              <label>Batas Jual (hari sejak diterima)</label>
              <input
                inputMode="numeric"
                value={editing.due_days}
                onChange={(e) =>
                  setEditing((f) => ({ ...f, due_days: e.target.value.replace(/[^0-9]/g, "") }))
                }
              />
            </div>
            <div className="sheet-actions">
              <button className="btn-secondary" onClick={() => setEditing(null)}>
                Batal
              </button>
              <button className="btn-primary" disabled={saving} onClick={saveEdit}>
                {saving ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
