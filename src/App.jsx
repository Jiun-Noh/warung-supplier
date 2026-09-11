import { useState } from "react";
import ProvidersPage from "./pages/ProvidersPage.jsx";
import SupplierProductsPage from "./pages/SupplierProductsPage.jsx";
import DeliveriesPage from "./pages/DeliveriesPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import PaymentsPage from "./pages/PaymentsPage.jsx";
import { todayLabel } from "./utils.js";

const TABS = [
  { key: "providers", label: "Provider", icon: "🚚" },
  { key: "products", label: "Barang", icon: "📦" },
  { key: "deliveries", label: "Terima", icon: "📥" },
  { key: "dashboard", label: "Dashboard", icon: "⏰" },
  { key: "payments", label: "Bayar", icon: "💵" },
];

const TITLES = {
  providers: "Provider",
  products: "Barang Provider",
  deliveries: "Terima Barang",
  dashboard: "Dashboard",
  payments: "Pembayaran",
};

export default function App() {
  const [tab, setTab] = useState("providers");
  const [toast, setToast] = useState(null);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>{TITLES[tab]}</h1>
        <span className="subdate">{todayLabel()}</span>
      </header>

      <main className="app-main">
        {tab === "providers" && <ProvidersPage onToast={showToast} />}
        {tab === "products" && <SupplierProductsPage onToast={showToast} />}
        {tab === "deliveries" && <DeliveriesPage onToast={showToast} />}
        {tab === "dashboard" && <DashboardPage onToast={showToast} />}
        {tab === "payments" && <PaymentsPage onToast={showToast} />}
      </main>

      <nav className="app-nav">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "active" : ""}
            onClick={() => setTab(t.key)}
          >
            <span className="icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
