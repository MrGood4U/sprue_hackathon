import { ArrowLeft, CaretDown, CheckCircle } from "@phosphor-icons/react";
import { product, productSlug } from "../../data/demoProduct.js";

const tabs = [
  ["Build", `/app/products/${productSlug}/build`],
  ["API", `/app/products/${productSlug}/api`],
  ["Monetize", `/app/products/${productSlug}/monetize`],
];

export function ProductHeader({ active, navigate, buildStatus = "Ready to build" }) {
  return (
    <header className="product-header">
      <div className="product-title-row">
        <button className="back-link" onClick={() => navigate("/app")}>
          <ArrowLeft size={21} />
          <span>{product.name}</span>
        </button>
        <div className="product-head-actions">
          <button className="version-select">v1 proposed <CaretDown size={15} /></button>
          <span className="ready-pill"><CheckCircle size={18} weight="fill" />{buildStatus}</span>
        </div>
      </div>
      <nav className="product-tabs" aria-label="Product sections">
        {tabs.map(([label, target]) => (
          <button
            key={label}
            className={active === label ? "active" : ""}
            onClick={() => navigate(target)}
          >
            {label}
          </button>
        ))}
      </nav>
    </header>
  );
}
