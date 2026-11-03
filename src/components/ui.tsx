import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, icons } from './icons';

export function Button({
  variant = 'primary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button type="button" className={`btn btn-${variant} ${className}`} {...rest} />;
}

export function Tag({ children, onRemove }: { children: ReactNode; onRemove?: () => void }) {
  return (
    <span className="tag">
      {children}
      {onRemove && (
        <button type="button" className="tag-remove" onClick={onRemove} aria-label="Remove tag">
          ×
        </button>
      )}
    </span>
  );
}

export function Field({
  label,
  missing,
  children,
  className = '',
}: {
  label: string;
  missing?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`field ${missing ? 'is-missing' : ''} ${className}`}>
      <span className="field-label">
        {label}
        {missing && <span className="field-required"> · Required</span>}
      </span>
      {children}
    </label>
  );
}

export function SelectBox({
  value,
  onChange,
  options,
  placeholder = 'Select',
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <div className="box box-select">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <Icon src={icons.chevronField} size={16} />
    </div>
  );
}

/** A text input with suggestions, so people can pick an existing value or type a new one. */
export function ComboBox({
  value,
  onChange,
  options,
  placeholder = 'Select or type',
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const listId = useId();
  return (
    <div className="box box-select">
      <input list={listId} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      <Icon src={icons.chevronField} size={16} />
    </div>
  );
}

export function TextBox({
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: 'numeric' | 'text';
}) {
  return (
    <div className="box">
      <input value={value} placeholder={placeholder} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="box box-area">
      <textarea value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={`checkbox-box${checked ? ' is-checked' : ''}`}>{checked && <Icon src={icons.check} size={12} />}</span>
      <span className="checkbox-text">
        <span className="checkbox-label">{label}</span>
        {hint && <span className="checkbox-hint">{hint}</span>}
      </span>
    </label>
  );
}

export function TagInput({
  value,
  onChange,
  suggestions,
  placeholder = 'Add keywords, press Enter',
}: {
  value: string[];
  onChange: (v: string[]) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const listId = useId();
  const commit = (raw: string) => {
    const t = raw.trim().replace(/,$/, '');
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setDraft('');
  };
  return (
    <div className="box tag-input">
      {value.map((t) => (
        <Tag key={t} onRemove={() => onChange(value.filter((v) => v !== t))}>
          {t}
        </Tag>
      ))}
      <input
        list={listId}
        value={draft}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(',')) commit(v);
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(draft);
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft && commit(draft)}
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !value.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}

/** Closes when clicking outside or pressing Escape. */
export function Popover({
  trigger,
  children,
  align = 'left',
}: {
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="popover-anchor" ref={ref}>
      {trigger(open, () => setOpen((o) => !o))}
      {open && <div className={`popover popover-${align}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function FilterChip({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const text = selected.length === 0 ? label : selected.length === 1 ? `${label}: ${selected[0]}` : `${label}: ${selected.length}`;
  return (
    <Popover
      trigger={(open, toggle) => (
        <button type="button" className={`chip${selected.length ? ' is-set' : ''}${open ? ' is-open' : ''}`} onClick={toggle}>
          <span>{text}</span>
          <Icon src={icons.chevronSm} size={12} />
        </button>
      )}
    >
      {() => (
        <div className="menu">
          {options.length === 0 && <div className="menu-empty">Nothing to filter yet</div>}
          {options.map((o) => {
            const on = selected.includes(o);
            return (
              <button
                key={o}
                type="button"
                className="menu-item"
                onClick={() => onChange(on ? selected.filter((s) => s !== o) : [...selected, o])}
              >
                <span className={`menu-check${on ? ' is-on' : ''}`}>{on && <Icon src={icons.check} size={12} />}</span>
                {o}
              </button>
            );
          })}
          {selected.length > 0 && (
            <>
              <div className="menu-sep" />
              <button type="button" className="menu-item menu-muted" onClick={() => onChange([])}>
                Clear
              </button>
            </>
          )}
        </div>
      )}
    </Popover>
  );
}

export function Toasts({ toasts }: { toasts: { id: number; message: string }[] }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.message}
        </div>
      ))}
    </div>
  );
}
