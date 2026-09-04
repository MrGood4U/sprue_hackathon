export function AppHeader({ title, subtitle, actions }) {
  return (
    <header className="app-header">
      <div>
        <span className="eyebrow">Workspace / Demo</span>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="header-actions">{actions}</div>
    </header>
  );
}
