import { useState } from "react";

export default function ComboSearch({
  label,
  placeholder,
  options,
  getLabel,
  getSubLabel,
  getSearchText,
  selected,
  onSelect,
  onClear,
  emptyLabel,
  locked,
}) {
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
          {!locked && (
            <button type="button" className="btn-secondary" onClick={onClear}>
              Ganti
            </button>
          )}
        </div>
      </div>
    );
  }

  const filtered = (
    query.trim()
      ? options.filter((o) =>
          (getSearchText ? getSearchText(o) : getLabel(o)).toLowerCase().includes(query.trim().toLowerCase())
        )
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
