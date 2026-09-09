import {createContext, useCallback, useContext, useMemo, useRef} from "react";
import {useAuth} from "../auth/AuthProvider.jsx";
import {createProductCache} from "./productCache.js";

const ProductCacheContext = createContext(null);

export function ProductCacheProvider({children}) {
  const {identity} = useAuth();
  const workspaceId = identity?.defaultWorkspaceId;
  const cache = useRef(null);
  if (!cache.current) cache.current = createProductCache();

  const readProduct = useCallback(
    (productRef) => cache.current.read(workspaceId, productRef),
    [workspaceId],
  );
  const rememberProduct = useCallback(
    (product) => cache.current.remember(workspaceId, product),
    [workspaceId],
  );
  const forgetProduct = useCallback(
    (product) => cache.current.forget(workspaceId, product),
    [workspaceId],
  );
  const value = useMemo(
    () => ({readProduct, rememberProduct, forgetProduct}),
    [forgetProduct, readProduct, rememberProduct],
  );

  return <ProductCacheContext.Provider value={value}>{children}</ProductCacheContext.Provider>;
}

export function useProductCache() {
  const context = useContext(ProductCacheContext);
  if (!context) throw new Error("useProductCache must be used inside ProductCacheProvider");
  return context;
}
