import type { ReactNode } from "react";
import { DocsSidebar } from "./DocsSidebar";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export function DocsFrame({ activeSlug, children, aside }: { activeSlug?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="site-shell">
      <SiteHeader />
      <details className="mobile-docs-menu">
        <summary>Browse documentation</summary>
        <DocsSidebar activeSlug={activeSlug} />
      </details>
      <div className={`docs-grid ${aside ? "with-aside" : ""}`}>
        <DocsSidebar activeSlug={activeSlug} />
        <main id="main" className="docs-main">{children}</main>
        {aside}
      </div>
      <SiteFooter />
    </div>
  );
}
