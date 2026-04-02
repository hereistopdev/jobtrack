import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { formatTimeZoneOptionLabel } from "../utils/interviewZonedTime";
import { buildTimeZoneSearchBlob, filterTimeZoneOptions } from "../utils/timeZoneSearch";

/**
 * Searchable IANA timezone picker (abbreviations, UTC±, city names).
 * @param {object} props
 * @param {string} props.value - current IANA id
 * @param {(iana: string) => void} props.onChange
 * @param {Array<{ value: string; label: string }>} props.options
 * @param {string} [props.id]
 * @param {string} [props.ariaLabel]
 */
export default function TimeZoneCombobox({ value, onChange, options, id, ariaLabel }) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const enriched = useMemo(() => {
    return options.map((o) => ({
      ...o,
      searchBlob: buildTimeZoneSearchBlob(o.value)
    }));
  }, [options]);

  const filtered = useMemo(() => {
    return filterTimeZoneOptions(enriched, open ? filter : "");
  }, [enriched, filter, open]);

  useEffect(() => {
    setActiveIdx(0);
  }, [filter, open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, open, filtered.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setFilter("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const displayLabel = useMemo(() => {
    const found = options.find((o) => o.value === value);
    if (found) return found.label;
    return formatTimeZoneOptionLabel(value) || value;
  }, [options, value]);

  const selectValue = useCallback(
    (iana) => {
      onChange(iana);
      setOpen(false);
      setFilter("");
      inputRef.current?.blur();
    },
    [onChange]
  );

  const onKeyDown = useCallback(
    (e) => {
      if (!open) {
        if (e.key === "ArrowDown" || e.key === "Enter") {
          e.preventDefault();
          setOpen(true);
          setFilter("");
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        setFilter("");
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter" && filtered.length > 0) {
        e.preventDefault();
        selectValue(filtered[activeIdx].value);
      }
    },
    [open, filtered, activeIdx, selectValue]
  );

  return (
    <div ref={containerRef} className="tz-combobox">
      <input
        id={id}
        ref={inputRef}
        type="text"
        className="tz-combobox-input interview-cal-tz-select"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-autocomplete="list"
        aria-label={ariaLabel || "Calendar timezone"}
        autoComplete="off"
        spellCheck={false}
        value={open ? filter : displayLabel}
        placeholder="Country, city, EST, UTC+4…"
        onChange={(e) => {
          setFilter(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setFilter("");
        }}
        onKeyDown={onKeyDown}
      />
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          id={listboxId}
          className="tz-combobox-list"
          role="listbox"
          aria-label="Timezone matches"
        >
          {filtered.map((opt, i) => (
            <li
              key={opt.value}
              data-idx={i}
              role="option"
              aria-selected={opt.value === value}
              className={`tz-combobox-option${i === activeIdx ? " tz-combobox-option--active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                selectValue(opt.value);
              }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
      {open && filter.trim() && filtered.length === 0 && (
        <div className="tz-combobox-empty muted-text" role="status">
          No timezones match “{filter.trim()}”.
        </div>
      )}
    </div>
  );
}
