import { useEffect, useRef, useState } from "react";
import { CircleNotch, PencilSimple } from "@phosphor-icons/react";
import { useI18n } from "../../i18n/I18nProvider.jsx";

export function EditableProductName({
  name,
  onCommit,
  onTitleActivate,
  titleActivatesEdit = false,
  variant = "header",
}) {
  const { t } = useI18n();
  const inputRef = useRef(null);
  const commitRef = useRef(null);
  const [draft, setDraft] = useState(name);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) setDraft(name);
  }, [editing, name]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function beginEditing() {
    setDraft(name);
    setError("");
    setEditing(true);
  }

  function cancelEditing() {
    setDraft(name);
    setError("");
    setEditing(false);
  }

  async function commit() {
    if (commitRef.current) return undefined;
    const normalizedName = draft.trim();
    if (!normalizedName || normalizedName === name) {
      setDraft(name);
      setError("");
      setEditing(false);
      return undefined;
    }

    const request = Promise.resolve(onCommit(normalizedName));
    commitRef.current = request;
    setSaving(true);
    setError("");
    try {
      await request;
      setDraft(normalizedName);
      setEditing(false);
    } catch {
      setError(t("productName.saveError"));
      requestAnimationFrame(() => inputRef.current?.focus());
    } finally {
      commitRef.current = null;
      setSaving(false);
    }
    return undefined;
  }

  function handleTitleClick() {
    if (titleActivatesEdit) beginEditing();
    else onTitleActivate?.();
  }

  if (editing) {
    return (
      <span className={`editable-product-name editable-product-name-${variant} is-editing`}>
        <span className="editable-product-name-field">
          <input
            ref={inputRef}
            aria-label={t("productName.inputLabel")}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `product-name-error-${variant}` : undefined}
            value={draft}
            maxLength={120}
            disabled={saving}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                event.preventDefault();
                cancelEditing();
              }
            }}
          />
          {saving && <CircleNotch className="editable-product-name-spinner" size={16} aria-hidden="true" />}
        </span>
        {error && <span id={`product-name-error-${variant}`} className="editable-product-name-error" role="alert">{error}</span>}
      </span>
    );
  }

  return (
    <span className={`editable-product-name editable-product-name-${variant}`}>
      <button
        type="button"
        className="editable-product-name-title"
        aria-label={titleActivatesEdit ? t("productName.edit") : t("productName.open")}
        onClick={handleTitleClick}
      >
        {name}
      </button>
      <button
        type="button"
        className="editable-product-name-trigger"
        aria-label={t("productName.edit")}
        onClick={beginEditing}
      >
        <PencilSimple size={variant === "header" ? 17 : 15} aria-hidden="true" />
      </button>
    </span>
  );
}
