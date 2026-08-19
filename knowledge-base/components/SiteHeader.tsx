import Link from "next/link";
import { SearchBox } from "./SearchBox";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Klar Knowledge Base home">
        <span className="brand-word">Klar<span>.</span></span>
        <span className="brand-divider" aria-hidden="true" />
        <span className="brand-product">Knowledge Base</span>
      </Link>
      <div className="header-search"><SearchBox /></div>
      <nav className="header-nav" aria-label="Primary navigation">
        <Link href="/docs">Documentation</Link>
        <a href="https://github.com/karpit0499/klar" target="_blank" rel="noreferrer">Source &amp; License</a>
        <Link href="/docs/security-privacy-and-threat-model">Security</Link>
        <a href="https://github.com/karpit0499/klar/security/advisories/new" target="_blank" rel="noreferrer">Report privately</a>
        <a href="https://karpit0499.github.io/klar/" target="_blank" rel="noreferrer">Open Klar</a>
      </nav>
      <details className="mobile-site-menu">
        <summary aria-label="Open primary navigation">Menu</summary>
        <nav aria-label="Mobile primary navigation">
          <Link href="/docs">Documentation</Link>
          <a href="https://github.com/karpit0499/klar" target="_blank" rel="noreferrer">Source &amp; License</a>
          <Link href="/docs/security-privacy-and-threat-model">Security</Link>
          <a href="https://github.com/karpit0499/klar/security/advisories/new" target="_blank" rel="noreferrer">Report privately</a>
          <a href="https://karpit0499.github.io/klar/" target="_blank" rel="noreferrer">Open Klar</a>
        </nav>
      </details>
    </header>
  );
}
