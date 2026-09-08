import {useCallback, useEffect, useState} from "react";
import {useAuth} from "../auth/AuthProvider.jsx";
import {getWalletAccess} from "../../services/api/wallet.js";
import {
  createProduct,
  deleteProduct,
  getProduct,
  getWorkspaceOverview,
  listProducts,
  updateProduct,
} from "../../services/api/products.js";

export function useProductDashboard() {
  const {identity, getAccessToken} = useAuth();
  const workspaceId = identity?.defaultWorkspaceId;
  const [state, setState] = useState({
    status: "loading",
    products: [],
    overview: null,
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
      const [products, overview] = await Promise.all([
        listProducts(options),
        getWorkspaceOverview(options),
      ]);
      setState({
        status: "ready",
        products: products.products,
        overview: overview.overview,
        observedAt: overview.observedAt,
        error: null,
      });
    } catch (error) {
      if (error?.name === "AbortError") return;
      setState((current) => ({...current, status: "error", error}));
    }
  }, [scope]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const create = useCallback(async () => {
    const options = await scope();
    const walletAccess = await getWalletAccess(options);
    const wallet = walletAccess.wallets.find(
      (item) => item.status === "active" || item.status === "restricted",
    );
    if (!wallet) throw new Error("PRODUCT_WALLET_REQUIRED");
    const product = await createProduct({
      name: "New Product",
      description: null,
      originalIntent: "",
      accountWalletId: wallet.id,
    }, options);
    return product;
  }, [scope]);

  const rename = useCallback(async (productId, name) => {
    const options = await scope();
    const current = await getProduct(productId, options);
    const updated = await updateProduct(productId, {name}, {
      ...options,
      lockVersion: current.lockVersion,
    });
    setState((value) => ({
      ...value,
      products: value.products.map((item) => item.id === productId ? updated : item),
    }));
    return updated;
  }, [scope]);

  const remove = useCallback(async (productId) => {
    const options = await scope();
    const current = await getProduct(productId, options);
    const deletion = await deleteProduct(productId, {
      ...options,
      lockVersion: current.lockVersion,
    });
    setState((value) => ({
      ...value,
      products: value.products.filter((item) => item.id !== productId),
    }));
    try {
      const overview = await getWorkspaceOverview(options);
      setState((value) => ({
        ...value,
        overview: overview.overview,
        observedAt: overview.observedAt,
      }));
    } catch {
      // The product deletion has already succeeded. Keep the list truthful and
      // refresh aggregate metrics on the next normal Dashboard load.
    }
    return deletion;
  }, [scope]);

  return {
    ...state,
    refresh: () => load(),
    create,
    rename,
    remove,
  };
}
