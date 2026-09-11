import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";

const emptyForm = { name: "", phone1: "", phone2: "", payment_cycle: "harian" };

const CYCLE_LABEL = {
  harian: "Harian (bayar besok)",
  mingguan: "Mingguan",
  bulanan: "Bulanan",
};

function normalizeName(name) {
  return name.trim().toLowerCase();
}

function PaymentCycleSelect({ value, onChange }) {
  return (
    <select value={value} onChange={onChange}>
      <option value="harian">Harian (bayar besok)</option>
      <option value="mingguan">Mingguan</option>
      <option value="bulanan">Bulanan</option>
    </select>
  );
}

export default function ProvidersPage({ onToast }) {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("providers")
      .select("*")
      .order("name", { ascending: true });
    if (error) console.error(error);
    setProviders(data || []);
    setLoading(false);
  }

  function isDuplicateName(name, excludeId) {
    const normalized = normalizeName(name);
    return providers.some((p) => p.id !== excludeId && normalizeName(p.name) === normalized);
  }

  async function addProvider() {
    if (!form.name.trim()) {
      onToast("Isi nama provider dulu");
      return;
    }
    if (isDuplicateName(form.name)) {
      onToast("Provider dengan nama ini sudah ada");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("providers").insert({
      name: form.name.trim(),
      phone1: form.phone1.trim() || null,
      phone2: form.phone2.trim() || null,
      payment_cycle: form.payment_cycle,
    });
    setSaving(false);
    if (error) {
      console.error(error);
      onToast(
        error.code === "23505" ? "Provider dengan nama ini sudah ada" : "Gagal menambahkan"
      );
      return;
    }
    setForm(emptyForm);
    setShowAdd(false);
    onToast("Provider ditambahkan");
    load();
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editing.name.trim()) {
      onToast("Nama provider tidak boleh kosong");
      return;
    }
    if (isDuplicateName(editing.name, editing.id)) {
      onToast("Provider dengan nama ini sudah ada");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("providers")
      .update({
        name: editing.name.trim(),
        phone1: editing.phone1?.trim() || null,
        phone2: editing.phone2?.trim() || null,
        payment_cycle: editing.payment_cycle,
      })
      .eq("id", editing.id);
    setSaving(false);
    if (error) {
      console.error(error);
      onToast(
        error.code === "23505" ? "Provider dengan nama ini sudah ada" : "Gagal menyimpan perubahan"
      );
      return;
    }
    setEditing(null);
    onToast("Tersimpan");
    load();
  }

  if (loading) return <div className="empty-state">Memuat…</div>;

  return (
    <div>
      <button
        className="btn-primary"
        style={{ width: "100%", marginBottom: 14 }}
        onClick={() => setShowAdd(true)}
      >
        + Tambah Provider Baru
      </button>

      {providers.length === 0 && (
        <div className="empty-state">Belum ada provider. Tambahkan lewat tombol di atas.</div>
      )}

      {providers.map((p) => (
        <div className="list-row" key={p.id} onClick={() => setEditing({ ...p })}>
          <div>
            <div className="name">{p.name}</div>
            <div className="meta">
              {CYCLE_LABEL[p.payment_cycle]}
              {p.phone1 && ` · ${p.phone1}`}
              {p.phone2 && ` · ${p.phone2}`}
            </div>
          </div>
        </div>
      ))}

      {showAdd && (
        <div className="sheet-backdrop" onClick={() => setShowAdd(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Tambah Provider Baru</h2>
            <div className="form-field">
              <label>Nama Provider</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Contoh: Bu Ifa"
              />
            </div>
            <div className="form-row-split">
              <div className="form-field">
                <label>No. HP 1</label>
                <input
                  value={form.phone1}
                  onChange={(e) => setForm((f) => ({ ...f, phone1: e.target.value }))}
                  placeholder="0812xxxxxxx"
                />
              </div>
              <div className="form-field">
                <label>No. HP 2</label>
                <input
                  value={form.phone2}
                  onChange={(e) => setForm((f) => ({ ...f, phone2: e.target.value }))}
                  placeholder="(opsional)"
                />
              </div>
            </div>
            <div className="form-field">
              <label>Siklus Pembayaran</label>
              <PaymentCycleSelect
                value={form.payment_cycle}
                onChange={(e) => setForm((f) => ({ ...f, payment_cycle: e.target.value }))}
              />
            </div>
            <div className="sheet-actions">
              <button className="btn-secondary" onClick={() => setShowAdd(false)}>
                Batal
              </button>
              <button className="btn-primary" disabled={saving} onClick={addProvider}>
                {saving ? "Menyimpan…" : "Tambah"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="sheet-backdrop" onClick={() => setEditing(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Provider</h2>
            <div className="form-field">
              <label>Nama Provider</label>
              <input
                value={editing.name}
                onChange={(e) => setEditing((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="form-row-split">
              <div className="form-field">
                <label>No. HP 1</label>
                <input
                  value={editing.phone1 || ""}
                  onChange={(e) => setEditing((f) => ({ ...f, phone1: e.target.value }))}
                />
              </div>
              <div className="form-field">
                <label>No. HP 2</label>
                <input
                  value={editing.phone2 || ""}
                  onChange={(e) => setEditing((f) => ({ ...f, phone2: e.target.value }))}
                />
              </div>
            </div>
            <div className="form-field">
              <label>Siklus Pembayaran</label>
              <PaymentCycleSelect
                value={editing.payment_cycle}
                onChange={(e) => setEditing((f) => ({ ...f, payment_cycle: e.target.value }))}
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
