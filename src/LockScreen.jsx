import { useState } from "react";

const PIN = import.meta.env.VITE_APP_PIN || "";
const PIN_LENGTH = 6;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export default function LockScreen({ onUnlock }) {
  const [entered, setEntered] = useState("");
  const [error, setError] = useState(false);

  function press(digit) {
    if (entered.length >= PIN_LENGTH) return;
    setError(false);
    const next = entered + digit;
    setEntered(next);
    if (next.length === PIN_LENGTH) {
      if (PIN && next === PIN) {
        onUnlock();
      } else {
        setError(true);
        setTimeout(() => setEntered(""), 400);
      }
    }
  }

  function backspace() {
    setError(false);
    setEntered((s) => s.slice(0, -1));
  }

  return (
    <div className="lock-screen">
      <div className="lock-title">🔒 Warung Supplier</div>

      <div className={"lock-dots" + (error ? " lock-dots-error" : "")}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span key={i} className={"lock-dot" + (i < entered.length ? " filled" : "")} />
        ))}
      </div>

      <div className="lock-error">{error ? "PIN salah, coba lagi" : " "}</div>

      <div className="lock-keypad">
        {KEYS.map((d) => (
          <button type="button" key={d} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <span />
        <button type="button" onClick={() => press("0")}>
          0
        </button>
        <button type="button" onClick={backspace} aria-label="Hapus">
          ⌫
        </button>
      </div>
    </div>
  );
}
