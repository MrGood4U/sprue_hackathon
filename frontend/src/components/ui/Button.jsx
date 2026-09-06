export function IconButton({ label, children, className = "", ...props }) {
  return (
    <button {...props} className={`icon-button ${className}`.trim()} aria-label={label} title={label}>
      {children}
    </button>
  );
}

export function Button({ variant = "secondary", icon: Icon, children, className = "", ...props }) {
  return (
    <button className={`button button-${variant} ${className}`} {...props}>
      {Icon && <Icon size={17} weight="bold" />}
      <span>{children}</span>
    </button>
  );
}
