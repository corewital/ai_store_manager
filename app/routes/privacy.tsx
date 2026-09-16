import type { LinksFunction, MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy — CorePilot AI" },
  {
    name: "description",
    content:
      "How CorePilot AI collects, uses, and protects Shopify merchant data.",
  },
];

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: "/landing/landing.css" },
  { rel: "stylesheet", href: "/landing/site-pages.css" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap",
  },
];

export default function PrivacyPolicy() {
  const year = new Date().getFullYear();

  return (
    <div className="cp-site">
      <div className="cp-site__topbar">
        <span className="live">
          <span className="dot" aria-hidden />
          Legal · Privacy
        </span>
        <span>Data protection &amp; merchant privacy</span>
      </div>

      <header className="cp-site__header">
        <div className="cp-site__header-inner">
          <Link to="/" className="cp-site__brand" aria-label="CorePilot AI Home">
            <span className="cp-site__brand-mark">
              <img src="/images/Monogram.png" alt="" />
            </span>
            <span className="cp-site__brand-text">
              <span className="cp-site__brand-title">
                CorePilot
                <span className="cp-site__brand-badge">AI</span>
              </span>
              <span className="cp-site__brand-sub">Shopify Catalog Intelligence</span>
            </span>
          </Link>
          <nav className="cp-site__nav" aria-label="Main">
            <Link to="/">Home</Link>
            <Link to="/features">Features</Link>
            <Link to="/#pricing">Pricing</Link>
            <Link to="/privacy" className="is-active">
              Privacy
            </Link>
          </nav>
          <Link to="/#hero-audit" className="cp-site__cta">
            Install Free App
          </Link>
        </div>
      </header>

      <section className="cp-site__hero">
        <div className="cp-site__hero-inner">
          <span className="cp-site__eyebrow">Legal</span>
          <h1>Privacy Policy</h1>
          <p className="lead">
            How CorePilot AI collects, uses, and protects Shopify merchant data.
          </p>
          <p className="cp-site__meta">
            Last updated: July 30, 2026 · Effective for{" "}
            <a href="https://corepilotai.corewital.com">
              corepilotai.corewital.com
            </a>
          </p>
        </div>
      </section>

      <main className="cp-site__main">
        <section>
          <h2>Overview</h2>
          <p>
            CorePilot AI (“we”, “us”, “our”), operated by CoreWital, provides a
            Shopify embedded app that scans and helps optimize store catalogs.
            This Privacy Policy explains what data we process and why.
          </p>
        </section>

        <section>
          <h2>1. Who this applies to</h2>
          <p>
            Merchants and staff who install or use CorePilot AI on a Shopify
            store, and visitors to our public website.
          </p>
        </section>

        <section>
          <h2>2. Data we collect</h2>
          <ul>
            <li>
              <strong>Shopify store data</strong> — shop domain, plan, product /
              collection / image metadata, SEO fields, inventory flags, and
              related Admin API data needed for scans and fixes (scopes granted
              at install).
            </li>
            <li>
              <strong>Session &amp; auth</strong> — Shopify session tokens and
              offline access tokens (stored securely) so the app can run scans
              and apply approved fixes.
            </li>
            <li>
              <strong>Usage &amp; ops logs</strong> — scan results, fix queue
              status, API call logs, webhook receipts, and error messages for
              reliability.
            </li>
            <li>
              <strong>Admin Core accounts</strong> — email, name, and role for
              invited internal operators of our back office (separate from Shopify
              merchant login).
            </li>
            <li>
              <strong>Support</strong> — messages and contact details you send via
              support tickets or email.
            </li>
            <li>
              <strong>Billing</strong> — subscription status and plan via Shopify
              Billing API (we do not store full payment card numbers).
            </li>
          </ul>
        </section>

        <section>
          <h2>3. How we use data</h2>
          <ul>
            <li>
              Provide store health scans, AI-assisted copy/SEO/alt text, and image
              optimization.
            </li>
            <li>Apply merchant-approved fixes to the Shopify store.</li>
            <li>Enforce plan limits, billing, and module access.</li>
            <li>
              Operate background jobs (scans, reports) and improve reliability.
            </li>
            <li>Respond to support requests and security incidents.</li>
          </ul>
          <p>
            We do <strong>not</strong> sell merchant store data. We do not use
            store content to train public AI models for unrelated products.
          </p>
        </section>

        <section>
          <h2>4. AI processing</h2>
          <p>
            When you use AI Fix or the assistant, relevant product/collection text
            may be sent to configured AI providers (for example Google Gemini or
            other keys you enable in Admin) to generate suggestions. Providers
            process that content under their own terms. Image pixel processing for
            optimization is done with our image tooling (sharp), not generative
            image AI.
          </p>
        </section>

        <section>
          <h2>5. Sharing</h2>
          <p>We share data only as needed with:</p>
          <ul>
            <li>Shopify (platform APIs and billing).</li>
            <li>
              Hosting/database providers (e.g. Vercel, Turso) that process data on
              our behalf.
            </li>
            <li>AI providers when you trigger AI features.</li>
            <li>Legal authorities when required by law.</li>
          </ul>
        </section>

        <section>
          <h2>6. Retention &amp; deletion</h2>
          <p>
            We keep store-linked data while the app is installed. After uninstall
            or a Shopify GDPR/redact webhook, we delete or anonymize merchant data
            according to Shopify’s data protection requirements. Soft-deleted
            records may be purged on a schedule.
          </p>
        </section>

        <section>
          <h2>7. Security</h2>
          <p>
            Access tokens and secrets are stored server-side. Admin Core uses a
            separate cookie session. We use HTTPS and restrict production database
            access to our live environment.
          </p>
        </section>

        <section>
          <h2>8. Your choices</h2>
          <ul>
            <li>Uninstall the app from Shopify Admin to stop processing.</li>
            <li>Request access or deletion by contacting us (below).</li>
            <li>Disable AI or modules where settings allow.</li>
          </ul>
        </section>

        <section>
          <h2>9. Children</h2>
          <p>
            CorePilot AI is for business use and is not directed at children.
          </p>
        </section>

        <section>
          <h2>10. Changes</h2>
          <p>
            We may update this policy. The “Last updated” date above will change;
            continued use after updates means you accept the revised policy.
          </p>
        </section>

        <section>
          <h2>11. Contact</h2>
          <p>
            Questions about privacy or data requests:
            <br />
            Email:{" "}
            <a href="mailto:corewital@gmail.com">corewital@gmail.com</a>
            <br />
            Website:{" "}
            <a href="https://corepilotai.corewital.com">
              https://corepilotai.corewital.com
            </a>
          </p>
        </section>
      </main>

      <footer className="cp-site__footer">
        <div className="cp-site__footer-inner">
          <div>
            <Link to="/" className="cp-site__brand">
              <span className="cp-site__brand-mark">
                <img src="/images/Monogram.png" alt="" />
              </span>
              <span className="cp-site__brand-title">
                CorePilot
                <span className="cp-site__brand-badge">AI</span>
              </span>
            </Link>
            <p>
              Autonomous Shopify embedded application for store health auditing
              and merchant AI guidance.
            </p>
          </div>
          <div>
            <h4>Navigation</h4>
            <ul>
              <li>
                <Link to="/">Home</Link>
              </li>
              <li>
                <Link to="/features">Features</Link>
              </li>
              <li>
                <Link to="/#pricing">Pricing</Link>
              </li>
              <li>
                <Link to="/privacy">Privacy</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Support</h4>
            <ul>
              <li>
                <a href="mailto:corewital@gmail.com">corewital@gmail.com</a>
              </li>
              <li>In-app Support menu</li>
            </ul>
          </div>
        </div>
        <div className="cp-site__footer-bottom">
          <span>© {year} CorePilot AI · CoreWital</span>
          <Link to="/privacy">Privacy policy</Link>
        </div>
      </footer>
    </div>
  );
}
