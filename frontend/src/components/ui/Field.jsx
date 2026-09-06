export function Field({ label, hint, htmlFor, children }) {
  const content = (
    <>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </>
  );

  if (htmlFor) {
    return (
      <div className="field">
        <label className="field-label" htmlFor={htmlFor}>{label}</label>
        {children}
        {hint && <span className="field-hint">{hint}</span>}
      </div>
    );
  }

  return (
    <label className="field">
      {content}
    </label>
  );
}
