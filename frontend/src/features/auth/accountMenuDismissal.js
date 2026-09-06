export function shouldDismissAccountMenuFromBlur(root, relatedTarget) {
  return Boolean(relatedTarget && !root.contains(relatedTarget));
}
