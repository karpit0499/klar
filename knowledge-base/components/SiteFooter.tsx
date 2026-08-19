import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <p><strong>Klar Knowledge Base</strong> · Public documentation · Current implementation baseline v2.6.1</p>
        <p>This site has no form for uploading application data, personal information, credentials, or secrets.</p>
      </div>
      <nav aria-label="Knowledge-base policies and reporting">
        <a href="https://github.com/karpit0499/klar" target="_blank" rel="noreferrer">Source &amp; License</a>
        <Link href="/docs/security-privacy-and-threat-model">Security</Link>
        <a href="https://github.com/karpit0499/klar/security/advisories/new" target="_blank" rel="noreferrer">Report a vulnerability privately</a>
      </nav>
    </footer>
  );
}
