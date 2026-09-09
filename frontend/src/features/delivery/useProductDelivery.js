import {useCallback, useEffect, useState} from "react";
import {resolveProduct} from "../agent/agentData.js";
import {useAuth} from "../auth/AuthProvider.jsx";
import {getProductDelivery} from "../../services/api/delivery.js";
import {updateProduct} from "../../services/api/products.js";
import {useProductCache} from "../products/ProductCacheProvider.jsx";

export function useProductDelivery(productRef) {
  const {identity, getAccessToken} = useAuth();
  const workspaceId = identity?.defaultWorkspaceId;
  const {readProduct, rememberProduct} = useProductCache();
  const [state, setState] = useState(() => ({
    status: "loading",
    product: readProduct(productRef),
    delivery: null,
    observedAt: null,
    error: null,
  }));

  const scope = useCallback(async () => {
    const accessToken = await getAccessToken();
    if (!workspaceId || !accessToken) throw new Error("AUTH_REQUIRED");
    return {workspaceId, accessToken};
  }, [getAccessToken, workspaceId]);

  const load = useCallback(async (signal) => {
    setState((current) => ({...current, status: "loading", product: readProduct(productRef), error: null}));
    try {
      const options = {...await scope(), signal};
      const product = await resolveProduct(productRef, options);
      const result = await getProductDelivery(product.id, options);
      rememberProduct(product);
      setState({status: "ready", product, ...result, error: null});
    } catch (error) {
      if (error?.name === "AbortError") return;
      setState((current) => ({...current, status: "error", error}));
    }
  }, [productRef, readProduct, rememberProduct, scope]);

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
    rememberProduct(product);
    setState((current) => ({...current, product}));
  }, [rememberProduct, scope, state.product]);

  return {...state, workspaceId, refresh, rename};
}
