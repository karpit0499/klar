import Link from "next/link";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

export default function NotFound() {
  return (
    <div className="site-shell">
      <SiteHeader />
      <main id="main" className="not-found">
        <p className="eyebrow"><span /> PAGE NOT FOUND</p>
        <h1>This knowledge moved—or does not exist yet.</h1>
        <p>Use the documentation index or search to find the current governed page.</p>
        <Link className="button primary" href="/docs">Open documentation</Link>
      </main>
      <SiteFooter />
    </div>
  );
}
