export const GRAPH_ACCESS_MODE = Object.freeze({
  API_KEY: "api",
  X402: "x402",
});

export function showsGraphCredentials(mode) {
  return mode === GRAPH_ACCESS_MODE.API_KEY;
}
