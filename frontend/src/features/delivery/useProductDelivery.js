import {useCallback, useEffect, useState} from "react";
import {resolveProduct} from "../agent/agentData.js";
import {useAuth} from "../auth/AuthProvider.jsx";
import {getProductDelivery} from "../../services/api/delivery.js";
import {updateProduct} from "../../services/api/products.js";

export function useProductDelivery(productRef) {
  const {identity, getAccessToken} = useAuth();
  const workspaceId = identity?.defaultWorkspaceId;
  const [state, setState] = useState({
    status: "loading",
    product: null,
    delivery: null,
    observedAt: null,
    error: null,
  });

  const scope = useCallback(async () => {
    const accessToken = await getAccessToken();
    if (!workspaceId || !accessToken) throw new Error("AUTH_REQUIRED");
    return {workspaceId, accessToken};
  }, [getAccessToken, workspaceId]);

  const load = useCallback(async (signal) => {
    setState((current) => ({...current, status: "loading", error: null}));
    try {
      const options = {...await scope(), signal};
      const product = await resolveProduct(productRef, options);
      const result = await getProductDelivery(product.id, options);
      setState({status: "ready", product, ...result, error: null});
    } catch (error) {
      if (error?.name === "AbortError") return;
      setState((current) => ({...current, status: "error", error}));
    }
  }, [productRef, scope]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refresh = useCallback(() => load(), [load]);

  const rename = useCallback(async (name) => {
    if (!state.product) return;
    const product = await updateProduct(state.product.id, {name}, {
      ...await scope(),
      lockVersion: state.product.lockVersion,
    });
    setState((current) => ({...current, product}));
  }, [scope, state.product]);

  return {...state, workspaceId, refresh, rename};
}
