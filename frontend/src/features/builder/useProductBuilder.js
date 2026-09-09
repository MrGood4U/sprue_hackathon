import {useCallback, useEffect, useState} from "react";
import {useAuth} from "../auth/AuthProvider.jsx";
import {loadAgentMessages, resolveProduct} from "../agent/agentData.js";
import {latestRunMessages} from "../agent/latestRunMessages.js";
import {listAgentSessions} from "../../services/api/agent.js";
import {updateProduct} from "../../services/api/products.js";
import {browserSessionStorage, projectAgentBuilderDraft, readCachedBuilderDraft} from "./liveBuilderProjection.js";
import {useProductCache} from "../products/ProductCacheProvider.jsx";

export function useProductBuilder(productRef) {
  const {identity, getAccessToken} = useAuth();
  const workspaceId = identity?.defaultWorkspaceId;
  const {readProduct, rememberProduct} = useProductCache();
  const [state, setState] = useState(() => ({status: "loading", product: readProduct(productRef), draft: null, error: null}));

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
      const sessions = await listAgentSessions({...options, productId: product.id});
      const session = sessions.find((item) => item.status === "active") ?? sessions[0] ?? null;
      const messages = latestRunMessages(session ? await loadAgentMessages(session.id, options) : []);
      const projected = projectAgentBuilderDraft(product, messages);
      const cached = readCachedBuilderDraft(browserSessionStorage(), workspaceId, product.id, projected.origin.originKey);
      rememberProduct(product);
      setState({status: "ready", product, draft: cached ?? projected, error: null});
    } catch (error) {
      if (error?.name === "AbortError") return;
      setState((current) => ({...current, status: "error", error}));
    }
  }, [productRef, readProduct, rememberProduct, scope, workspaceId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refresh = useCallback(() => {
    const controller = new AbortController();
    return load(controller.signal);
  }, [load]);

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
