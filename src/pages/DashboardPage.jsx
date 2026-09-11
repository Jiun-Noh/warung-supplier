import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.js";
import { todayISODate } from "../utils.js";

function daysOverdue(dueDate) {
  const due = new Date(dueDate + "T00:00:00");
  const today = new Date(todayISODate() + "T00:00:00");
  return Math.round((today - due) / (1000 * 60 * 60 * 24));
}

export default function DashboardPage({ onToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const today = todayISODate();
    const { data, error } = await supabase
      .from("delivery_items")
      .select("*, providers(name)")
      .eq("cleared", false)
      .lt("due_date", today)
      .order("due_date", { ascending: true });
    if (error) console.error(error);
    setItems(data || []);
    setLoading(false);
  }

  async function clearItem(item) {
    const { error } = await supabase
      .from("delivery_items")
      .update({ cleared: true })
      .eq("id", item.id);
    if (error) {
      console.error(error);
      onToast("Gagal menandai selesai");
      return;
    }
    setItems((s) => s.filter((i) => i.id !== item.id));
  }

  if (loading) return <div className="empty-state">Memuat…</div>;

  return (
    <div>
      <div className="section-title">Barang yang sudah lewat batas jual</div>

      {items.length === 0 ? (
        <div className="empty-state">Tidak ada barang yang lewat batas jual. Aman!</div>
      ) : (
        items.map((item) => (
          <div className="list-row" key={item.id}>
            <div>
              <div className="name">{item.product_name}</div>
              <div className="meta">
                {item.providers?.name || "Tanpa provider"} · Diterima {item.delivery_date} ·
                Batas {item.due_date} ·{" "}
                <span style={{ color: "var(--chili-600)", fontWeight: 700 }}>
                  Lewat {daysOverdue(item.due_date)} hari
                </span>
              </div>
            </div>
            <button className="btn-secondary" onClick={() => clearItem(item)}>
              Tandai Selesai
            </button>
          </div>
        ))
      )}
    </div>
  );
}
