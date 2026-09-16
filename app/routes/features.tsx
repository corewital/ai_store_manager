import type { LinksFunction, MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";
import { useEffect } from "react";

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
  { rel: "stylesheet", href: "/landing/site-pages.css" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200",
  },
];

export default function FeaturesPage() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
    document.body.style.background = "#040706";
    document.body.style.margin = "0";
    return () => {
      document.documentElement.classList.remove("dark");
      document.body.style.background = "";
      document.body.style.margin = "";
    };
  }, []);

  const year = new Date().getFullYear();

  return (
    <div className="cp-site">
      <div className="cp-site__topbar">
        <span className="live">
          <span className="dot" aria-hidden />
          Shopify Embedded App
        </span>
        <span className="hidden-sm">Features · Plans · AI Assistant</span>
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
            <Link to="/features" className="is-active">
              Features
            </Link>
            <Link to="/#pricing">Pricing</Link>
            <Link to="/privacy">Privacy</Link>
          </nav>
          <Link to="/#hero-audit" className="cp-site__cta">
            Install Free App
          </Link>
        </div>
      </header>

      <section className="cp-site__hero">
        <div className="cp-site__hero-inner">
          <span className="cp-site__eyebrow">Merchant guide</span>
          <h1>
            Features &amp;{" "}
            <span style={{ color: "#34d399" }}>AI Assistant</span>
          </h1>
          <p className="lead">
            What CorePilot AI does, which plans include the store-aware AI Assistant,
            and how to try before you buy.
          </p>
        </div>
      </section>

      <main className="cp-site__main">
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
          <div className="cp-grid-2">
            <div className="cp-card">
              <h3>Example questions</h3>
              <ul>
                <li>What are my biggest store issues right now?</li>
                <li>Which products need better SEO?</li>
                <li>How can I improve my health score?</li>
                <li>What should I fix first before a sale?</li>
              </ul>
            </div>
            <div className="cp-card">
              <h3>What it does not do</h3>
              <ul>
                <li>Does not edit theme Liquid or checkout</li>
                <li>Does not replace one-click fix modules</li>
                <li>Does not invent catalog data</li>
              </ul>
            </div>
          </div>
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
          <h2>All features</h2>
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
          <Link to="/#hero-audit" className="cp-btn-primary">
            Install CorePilot AI
          </Link>
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
              Shopify embedded app for store health scans, AI fixes, and live-context
              merchant guidance.
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
              <li>Billed via Shopify</li>
            </ul>
          </div>
        </div>
        <div className="cp-site__footer-bottom">
          <span>© {year} CorePilot AI · CoreWital</span>
          <span style={{ color: "#34d399" }}>All systems healthy</span>
        </div>
      </footer>
    </div>
  );
}
