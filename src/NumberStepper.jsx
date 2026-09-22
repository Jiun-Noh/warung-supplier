import { sanitizeQtyInput } from "./utils.js";

export default function NumberStepper({ value, onChange, step, min = 0, disabled, placeholder }) {
  function bump(delta) {
    const next = Math.max(min, (Number(value) || 0) + delta);
    onChange(String(next));
  }
  return (
    <div className="number-stepper">
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled || (Number(value) || 0) <= min}
        onClick={() => bump(-step)}
        aria-label="Kurangi"
      >
        −
      </button>
      <input
        inputMode="numeric"
        placeholder={placeholder}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(sanitizeQtyInput(e.target.value))}
      />
      <button type="button" tabIndex={-1} disabled={disabled} onClick={() => bump(step)} aria-label="Tambah">
        +
      </button>
    </div>
  );
}
