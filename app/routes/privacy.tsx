import type { MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";
import styles from "./_index/styles.module.css";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy — CorePilot AI" },
  {
    name: "description",
    content:
      "How CorePilot AI collects, uses, and protects Shopify merchant data.",
  },
];

export default function PrivacyPolicy() {
  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link to="/" className={styles.brand}>
          <img
            src="/images/Main_Brand_Logo_Horizontal.png"
            alt="CorePilot AI"
            className={styles.brandLogo}
          />
        </Link>
        <nav className={styles.navLinks}>
          <Link to="/">Home</Link>
        </nav>
      </header>

      <article className={styles.legal}>
        <h1 className={styles.legalTitle}>Privacy Policy</h1>
        <p className={styles.legalMeta}>
          Last updated: July 30, 2026 · Effective for{" "}
          <a href="https://corepilotai.corewital.com">
            corepilotai.corewital.com
          </a>
        </p>

        <p>
          CorePilot AI (“we”, “us”, “our”), operated by CoreWital, provides a
          Shopify embedded app that scans and helps optimize store catalogs.
          This Privacy Policy explains what data we process and why.
        </p>

        <h2>1. Who this applies to</h2>
        <p>
          Merchants and staff who install or use CorePilot AI on a Shopify
          store, and visitors to our public website.
        </p>

        <h2>2. Data we collect</h2>
        <ul>
          <li>
            <strong>Shopify store data</strong> — shop domain, plan, product /
            collection / image metadata, SEO fields, inventory flags, and
            related Admin API data needed for scans and fixes (scopes granted
            at install).
          </li>
          <li>
            <strong>Session & auth</strong> — Shopify session tokens and offline
            access tokens (stored securely) so the app can run scans and apply
            approved fixes.
          </li>
          <li>
            <strong>Usage & ops logs</strong> — scan results, fix queue status,
            API call logs, webhook receipts, and error messages for reliability.
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

        <h2>3. How we use data</h2>
        <ul>
          <li>Provide store health scans, AI-assisted copy/SEO/alt text, and image optimization.</li>
          <li>Apply merchant-approved fixes to the Shopify store.</li>
          <li>Enforce plan limits, billing, and module access.</li>
          <li>Operate background jobs (scans, reports) and improve reliability.</li>
          <li>Respond to support requests and security incidents.</li>
        </ul>
        <p>
          We do <strong>not</strong> sell merchant store data. We do not use
          store content to train public AI models for unrelated products.
        </p>

        <h2>4. AI processing</h2>
        <p>
          When you use AI Fix or the assistant, relevant product/collection text
          may be sent to configured AI providers (for example Google Gemini or
          other keys you enable in Admin) to generate suggestions. Providers
          process that content under their own terms. Image pixel processing for
          optimization is done with our image tooling (sharp), not generative
          image AI.
        </p>

        <h2>5. Sharing</h2>
        <p>We share data only as needed with:</p>
        <ul>
          <li>Shopify (platform APIs and billing).</li>
          <li>Hosting/database providers (e.g. Vercel, Turso) that process data on our behalf.</li>
          <li>AI providers when you trigger AI features.</li>
          <li>Legal authorities when required by law.</li>
        </ul>

        <h2>6. Retention & deletion</h2>
        <p>
          We keep store-linked data while the app is installed. After uninstall
          or a Shopify GDPR/redact webhook, we delete or anonymize merchant data
          according to Shopify’s data protection requirements. Soft-deleted
          records may be purged on a schedule.
        </p>

        <h2>7. Security</h2>
        <p>
          Access tokens and secrets are stored server-side. Admin Core uses a
          separate cookie session. We use HTTPS and restrict production database
          access to our live environment.
        </p>

        <h2>8. Your choices</h2>
        <ul>
          <li>Uninstall the app from Shopify Admin to stop processing.</li>
          <li>Request access or deletion by contacting us (below).</li>
          <li>Disable AI or modules where settings allow.</li>
        </ul>

        <h2>9. Children</h2>
        <p>CorePilot AI is for business use and is not directed at children.</p>

        <h2>10. Changes</h2>
        <p>
          We may update this policy. The “Last updated” date above will change;
          continued use after updates means you accept the revised policy.
        </p>

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
      </article>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} CorePilot AI · CoreWital</span>
        <span className={styles.footerLinks}>
          <Link to="/">Home</Link>
          <Link to="/privacy">Privacy policy</Link>
        </span>
      </footer>
    </div>
  );
}
