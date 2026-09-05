import { apiResponse, consumerResponse } from "./fixtures/responses.js";

function waitForDemo(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// These local services never send a request, sign a payment, or persist a product.
export const demoServices = {
  async buildVersion({ signal } = {}) {
    await waitForDemo(1500, signal);
    return { status: "complete", source: "demo" };
  },

  async testRequest({ signal } = {}) {
    await waitForDemo(800, signal);
    return structuredClone(apiResponse);
  },

  async requestPaidData({ signal, onProgress = () => {} } = {}) {
    signal?.throwIfAborted();
    onProgress(1);
    for (const stage of [2, 3, 4]) {
      await waitForDemo(700, signal);
      signal?.throwIfAborted();
      onProgress(stage);
    }
    return structuredClone(consumerResponse);
  },
};
