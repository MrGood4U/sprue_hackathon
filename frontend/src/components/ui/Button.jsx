export function IconButton({ label, children, ...props }) {
  return (
    <button className="icon-button" aria-label={label} title={label} {...props}>
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
