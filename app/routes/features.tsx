import type { LinksFunction, MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";

export const meta: MetaFunction = () => [
  { title: "Features & AI Assistant — CorePilot AI" },
  {
    name: "description",
    content:
      "CorePilot AI features: Health Score, scans, AI fixes, plans, and store-aware AI Assistant (Business & Enterprise).",
  },
];

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: "/landing/landing.css" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap",
  },
];

export default function FeaturesPage() {
  return (
    <div className="features-doc">
      <header className="features-doc__nav">
        <Link to="/">
          <img
            src="/images/Main_Brand_Logo_Horizontal.png"
            alt="CorePilot AI"
            height={36}
          />
        </Link>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
      </header>

      <main className="features-doc__main">
        <h1>CorePilot AI — Features &amp; AI Assistant</h1>
        <p className="lead">
          Merchant guide: what the app does, which plans include the AI Assistant,
          and how to try before you buy.
        </p>

        <section>
          <h2>What CorePilot AI does</h2>
          <p>
            CorePilot AI is a Shopify embedded app that scans your catalog, shows a{" "}
            <strong>Health Score</strong>, and helps you fix product, SEO, image, and
            collection issues with AI — inside Shopify admin.
          </p>
          <ol>
            <li>Run a scan (manual or automatic by plan)</li>
            <li>Review open issues on the dashboard</li>
            <li>Preview AI suggestions → apply one-click or bulk fixes</li>
            <li>
              On <strong>Business</strong> and <strong>Enterprise</strong>, use the{" "}
              <strong>AI Assistant</strong> for store-specific guidance
            </li>
          </ol>
        </section>

        <section id="ai-assistant">
          <h2>AI Assistant (Business &amp; Enterprise)</h2>
          <p>
            The in-app <strong>AI Assistant</strong> is not a generic chatbot. It uses
            your store&apos;s scan context: health score, open issues, catalog signals,
            and plan limits.
          </p>
          <h3>Example questions</h3>
          <ul>
            <li>What are my biggest store issues right now?</li>
            <li>Which products need better descriptions or SEO?</li>
            <li>How can I improve my health score this week?</li>
            <li>What should I fix first before a sale?</li>
          </ul>
          <h3>What it does not do</h3>
          <ul>
            <li>Does not edit theme Liquid or checkout</li>
            <li>Does not replace one-click fix modules (Products / SEO / Images / Fixes)</li>
            <li>Does not invent catalog data — answers use scan and Shopify context</li>
          </ul>
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>AI Assistant</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Free / Starter / Professional</td>
                <td>Not included</td>
              </tr>
              <tr>
                <td>Business ($19.99/mo)</td>
                <td>Included</td>
              </tr>
              <tr>
                <td>Enterprise ($99.99/mo)</td>
                <td>Included</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2>All features (by area)</h2>
          <ul>
            <li>Health Score dashboard</li>
            <li>Product, SEO, image, collection scans &amp; AI fixes</li>
            <li>Inventory &amp; performance (Professional+)</li>
            <li>One-click / bulk Fixes queue</li>
            <li>Reports &amp; email digests (by plan)</li>
            <li>Theme app embed (Online Store channel)</li>
          </ul>
        </section>

        <section>
          <h2>Plans at a glance</h2>
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Price</th>
                <th>Highlights</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Free</td>
                <td>$0</td>
                <td>50 products, 3 collections, 50 fixes, 3 manual scans</td>
              </tr>
              <tr>
                <td>Starter</td>
                <td>$4.99/mo</td>
                <td>300 products, monthly auto scan</td>
              </tr>
              <tr>
                <td>Professional</td>
                <td>$9.99/mo</td>
                <td>1,000 products, weekly scan, inventory</td>
              </tr>
              <tr>
                <td>Business</td>
                <td>$19.99/mo</td>
                <td>AI Assistant, daily scan, 5,000 fixes</td>
              </tr>
              <tr>
                <td>Enterprise</td>
                <td>$99.99/mo</td>
                <td>Unlimited catalog caps, 10,000 fixes, Assistant</td>
              </tr>
            </tbody>
          </table>
          <p>
            Upgrade or downgrade in the app under <strong>Settings → Billing</strong> via
            Shopify&apos;s plan page — no reinstall required.
          </p>
        </section>

        <section>
          <h2>Try before you buy</h2>
          <p>
            Install on a development store to test paid plans at $0. On live stores,
            billing runs through Shopify Settings → Bills.
          </p>
          <p>
            <Link to="/#hero-audit" className="features-doc__cta">
              Install CorePilot AI
            </Link>
          </p>
        </section>
      </main>

      <footer className="features-doc__footer">
        <span>© {new Date().getFullYear()} CorePilot AI · CoreWital</span>
        <Link to="/privacy">Privacy</Link>
      </footer>

      <style>{`
        .features-doc {
          font-family: "Hanken Grotesk", system-ui, sans-serif;
          background: #040706;
          color: #f8fafc;
          min-height: 100vh;
        }
        .features-doc__nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid rgba(16, 185, 129, 0.15);
        }
        .features-doc__nav nav {
          display: flex;
          gap: 1.25rem;
        }
        .features-doc__nav a {
          color: #94a3b8;
          text-decoration: none;
          font-size: 0.875rem;
        }
        .features-doc__nav a:hover {
          color: #34d399;
        }
        .features-doc__main {
          max-width: 42rem;
          margin: 0 auto;
          padding: 2.5rem 1.5rem 4rem;
          line-height: 1.6;
        }
        .features-doc h1 {
          font-family: Outfit, sans-serif;
          font-size: 1.75rem;
          margin-bottom: 0.75rem;
        }
        .features-doc h2 {
          font-family: Outfit, sans-serif;
          font-size: 1.25rem;
          margin-top: 2rem;
          color: #34d399;
        }
        .features-doc h3 {
          font-size: 1rem;
          margin-top: 1rem;
        }
        .features-doc .lead {
          color: #94a3b8;
        }
        .features-doc table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
          margin: 1rem 0;
        }
        .features-doc th,
        .features-doc td {
          border: 1px solid rgba(16, 185, 129, 0.2);
          padding: 0.5rem 0.75rem;
          text-align: left;
        }
        .features-doc th {
          background: #0d1411;
        }
        .features-doc__cta {
          display: inline-block;
          margin-top: 0.5rem;
          padding: 0.75rem 1.25rem;
          background: linear-gradient(90deg, #10b981, #34d399);
          color: #040706 !important;
          font-weight: 700;
          border-radius: 0.75rem;
        }
        .features-doc__footer {
          display: flex;
          justify-content: space-between;
          padding: 1.5rem;
          border-top: 1px solid rgba(16, 185, 129, 0.15);
          font-size: 0.75rem;
          color: #94a3b8;
        }
        .features-doc__footer a {
          color: #34d399;
        }
      `}</style>
    </div>
  );
}
