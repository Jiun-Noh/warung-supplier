import { useState } from "react";
import ProvidersPage from "./pages/ProvidersPage.jsx";
import SupplierProductsPage from "./pages/SupplierProductsPage.jsx";
import DeliveriesPage from "./pages/DeliveriesPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import PaymentsPage from "./pages/PaymentsPage.jsx";
import CustomerOrdersPage from "./pages/CustomerOrdersPage.jsx";
import LockScreen from "./LockScreen.jsx";
import { todayLabel } from "./utils.js";

const UNLOCK_KEY = "warung_unlocked";

function isUnlocked() {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

const TABS = [
  { key: "orders", label: "Pesanan", icon: "🧾" },
  // Terima/Bayar disembunyikan sementara — provider sekarang ditangani manual di kertas.
  // { key: "deliveries", label: "Terima", icon: "📥" },
  // { key: "payments", label: "Bayar", icon: "💵" },
  { key: "providers", label: "Provider", icon: "🚚" },
  { key: "products", label: "Barang", icon: "📦" },
  // Dashboard disembunyikan sementara — datanya berasal dari delivery_items yang sudah tidak diisi lagi.
  // { key: "dashboard", label: "Dashboard", icon: "⏰" },
];

const TITLES = {
  providers: "Provider",
  products: "Barang Provider",
  deliveries: "Terima Barang",
  dashboard: "Dashboard",
  payments: "Pembayaran",
  orders: "Pesanan Pelanggan",
};

export default function App() {
  const [tab, setTab] = useState("orders");
  const [toast, setToast] = useState(null);
  const [unlocked, setUnlocked] = useState(isUnlocked);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  if (!unlocked) {
    return (
      <LockScreen
        onUnlock={() => {
          try {
            sessionStorage.setItem(UNLOCK_KEY, "1");
          } catch {
            // ignore storage errors (private browsing, etc.)
          }
          setUnlocked(true);
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>{TITLES[tab]}</h1>
        <span className="subdate">{todayLabel()}</span>
      </header>

      <main className="app-main">
        {tab === "orders" && <CustomerOrdersPage onToast={showToast} />}
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
