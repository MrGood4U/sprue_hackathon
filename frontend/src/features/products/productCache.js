function cacheKey(workspaceId, productRef) {
  if (!workspaceId || !productRef) return null;
  return `${workspaceId}:${productRef}`;
}

export function createProductCache() {
  const products = new Map();

  return {
    read(workspaceId, productRef) {
      const key = cacheKey(workspaceId, productRef);
      return key ? products.get(key) ?? null : null;
    },
    remember(workspaceId, product) {
      if (!workspaceId || !product) return product;
      for (const productRef of [product.id, product.slug]) {
        const key = cacheKey(workspaceId, productRef);
        if (key) products.set(key, product);
      }
      return product;
    },
    forget(workspaceId, product) {
      if (!workspaceId || !product) return;
      for (const productRef of [product.id, product.slug]) {
        const key = cacheKey(workspaceId, productRef);
        if (key) products.delete(key);
      }
    },
  };
}
