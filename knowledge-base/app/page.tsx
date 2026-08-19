import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { allDocs, groupedDocs } from "../lib/docs";
import { SITE_URL } from "../lib/site";

export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
  openGraph: { url: SITE_URL },
};

export default function Home() {
  const docs = allDocs();
  const sections = groupedDocs();
  return (
    <div className="site-shell">
      <SiteHeader />
      <main id="main">
        <section className="hero">
          <div className="eyebrow"><span /> PUBLIC KNOWLEDGE BASE · v2.6.1</div>
          <h1>Understand Klar.<br /><em>Build it with confidence.</em></h1>
          <p className="hero-copy">Public, governed documentation for everyone who uses, teaches, supports, evaluates, or reviews Klar. No sign-in and no application-data uploads.</p>
          <div className="hero-actions">
            <Link className="button primary" href="/docs/getting-started">Start with Klar</Link>
            <Link className="button secondary" href="/docs">Browse all documentation</Link>
          </div>
          <dl className="hero-stats">
            <div><dt>{docs.length}</dt><dd>public pages</dd></div>
            <div><dt>{sections.length}</dt><dd>public knowledge domains</dd></div>
            <div><dt>6</dt><dd>publishable lifecycle states</dd></div>
            <div><dt>0</dt><dd>application-data forms</dd></div>
          </dl>
        </section>

        <section className="role-section section-wrap" aria-labelledby="choose-path">
          <div className="section-intro">
            <span className="section-number">01</span>
            <div><h2 id="choose-path">Choose your path</h2><p>Start with your goal. The same public knowledge base serves people using Klar, supporting learners, inspecting the implementation, and evaluating its safeguards.</p></div>
          </div>
          <div className="role-grid">
            <Link className="role-card cobalt" href="/docs/getting-started">
              <span>Students and job seekers</span><h3>Find work and stay in control</h3><p>Set up Klar, discover roles, prepare applications, and understand where your personal career data stays.</p><strong>Open the user guide →</strong>
            </Link>
            <Link className="role-card school" href="/docs/for-schools-and-career-services">
              <span>Schools and career services</span><h3>Support learners with clear boundaries</h3><p>Understand suitable use, rollout considerations, learner privacy, and how Klar complements human guidance.</p><strong>Open the institutional guide →</strong>
            </Link>
            <a className="role-card ink" href="https://github.com/karpit0499/klar" target="_blank" rel="noreferrer">
              <span>Developers and technical reviewers</span><h3>Inspect how Klar works</h3><p>Review the public source for verification under its source-available license. Viewing is permitted; reuse, modification, and deployment are not granted.</p><strong>Inspect the source and license →</strong>
            </a>
            <Link className="role-card assurance" href="/docs/security-privacy-and-threat-model">
              <span>Privacy and security reviewers</span><h3>Verify boundaries and safeguards</h3><p>Review data flows, network boundaries, threat assumptions, release evidence, and private reporting guidance.</p><strong>Open security and privacy →</strong>
            </Link>
          </div>
          <p className="public-safety-note"><strong>Public documentation, not an intake system.</strong> This knowledge base has no form for uploading a Resume, application, API key, diagnostic archive, or other personal or secret material.</p>
        </section>

        <section className="system-section section-wrap" aria-labelledby="system-view">
          <div className="section-intro">
            <span className="section-number">02</span>
            <div><h2 id="system-view">One product, clearly bounded</h2><p>Klar keeps personal career data local while using tightly scoped services for retrieval and optional intelligence.</p></div>
          </div>
          <div className="system-map" role="img" aria-label="Klar system overview showing browser, local storage, Worker, external sources, desktop shell, and local model runtime">
            <div className="system-node primary-node"><span>Product surface</span><strong>Browser / PWA</strong><small>React · TypeScript · Vite</small></div>
            <div className="system-arrow" aria-hidden="true">→</div>
            <div className="system-node"><span>Private workspace</span><strong>IndexedDB + vault</strong><small>Resume · jobs · packets · tracker</small></div>
            <div className="system-break" />
            <div className="system-node"><span>Bounded relay</span><strong>Cloudflare Worker</strong><small>Sources · Groq · allowlists</small></div>
            <div className="system-arrow" aria-hidden="true">→</div>
            <div className="system-node"><span>External systems</span><strong>Job sources + AI</strong><small>Only when the action requires it</small></div>
            <div className="system-break" />
            <div className="system-node"><span>Developer preview</span><strong>Electron desktop</strong><small>Sandboxed web renderer</small></div>
            <div className="system-arrow" aria-hidden="true">→</div>
            <div className="system-node"><span>Managed intelligence</span><strong>Local model runtime</strong><small>Loopback · signed packages</small></div>
          </div>
          <Link className="text-link" href="/docs/system-context-and-runtime-topology">Read the complete system architecture →</Link>
        </section>

        <section className="control-section section-wrap" aria-labelledby="controlled-knowledge">
          <div className="section-intro">
            <span className="section-number">03</span>
            <div><h2 id="controlled-knowledge">Public knowledge with a status</h2><p>Every published page is explicitly public and says whether it describes reality, a decision, a target, or history. Drafts, archives, and restricted classifications are excluded automatically.</p></div>
          </div>
          <div className="status-grid">
            <div><span className="status-pill current">Current</span><p>Verified against code, configuration, and tests.</p></div>
            <div><span className="status-pill approved">Approved</span><p>A reviewed policy or decision within its stated scope.</p></div>
            <div><span className="status-pill target">Target</span><p>Planned behavior that is not yet implementation evidence.</p></div>
            <div><span className="status-pill planned">Planned</span><p>Planning intent that is not yet an approved product contract.</p></div>
            <div><span className="status-pill deprecated">Deprecated</span><p>Supported only for migration or compatibility.</p></div>
            <div><span className="status-pill historical">Historical</span><p>A frozen record of a past release or decision.</p></div>
          </div>
          <Link className="text-link" href="/docs/source-of-truth">See the source-of-truth policy →</Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
