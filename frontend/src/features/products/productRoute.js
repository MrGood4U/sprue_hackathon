export function productRefFromPath(path) {
  const match = String(path ?? "").match(/^\/app\/products\/([^/]+)\/(?:agent|build|api|monetize)$/);
  return match ? decodeURIComponent(match[1]) : null;
}
