import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";

import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const meta: MetaFunction = () => [
  { title: "CorePilot AI — Shopify Store Health & Optimization" },
  {
    name: "description",
    content:
      "CorePilot AI scans your Shopify store for product, SEO, image, inventory, and collection issues, then fixes them automatically with AI.",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

const FEATURES = [
  {
    icon: "/images/Dashboard.png",
    title: "Store health score",
    text: "One dashboard grading products, SEO, images, inventory, and collections.",
  },
  {
    icon: "/images/AI_Assistant.png",
    title: "AI one-click fixes",
    text: "Generate descriptions, SEO, and alt text — apply single fixes instantly or in bulk.",
  },
  {
    icon: "/images/Reports.png",
    title: "Automatic scans",
    text: "Background cron scans your catalog daily and queues fixes without slowing your store.",
  },
  {
    icon: "/images/Images.png",
    title: "Image optimization",
    text: "Compress oversized images and add missing media to speed up page loads.",
  },
  {
    icon: "/images/Settings.png",
    title: "Multi-AI providers",
    text: "OpenAI, Gemini, Claude, OpenRouter and more with automatic key rotation and failover.",
  },
  {
    icon: "/images/Performance.png",
    title: "Reports & alerts",
    text: "Scheduled email summaries so you always know what changed and what needs attention.",
  },
];

const STEPS = [
  { n: "1", title: "Install", text: "Add CorePilot AI to your Shopify store in a click." },
  { n: "2", title: "Scan", text: "We audit your whole catalog and score every module." },
  { n: "3", title: "Fix & grow", text: "Approve AI fixes and watch your store health climb." },
];

export default function Index() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <div className={styles.brand}>
          <img
            src="/images/Main_Brand_Logo_Horizontal.png"
            alt="CorePilot AI"
            className={styles.brandLogo}
          />
        </div>
        <nav className={styles.navLinks}>
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <Link to="/admin/login">Admin</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.badge}>Shopify embedded app</span>
          <h1 className={styles.heading}>
            Fix your store health <span className={styles.grad}>with AI</span>
          </h1>
          <p className={styles.sub}>
            CorePilot AI continuously scans your Shopify catalog for product,
            SEO, image, inventory, and collection issues — then fixes them
            automatically so you can focus on selling.
          </p>

          {showForm ? (
            <Form className={styles.form} method="post" action="/auth/login">
              <label className={styles.label}>
                <span className={styles.labelText}>Your Shopify store</span>
                <input
                  className={styles.input}
                  type="text"
                  name="shop"
                  placeholder="my-shop.myshopify.com"
                  autoComplete="off"
                />
              </label>
              <button className={styles.button} type="submit">
                Install / Log in
              </button>
            </Form>
          ) : (
            <p className={styles.note}>
              Open this app from your Shopify admin to get started.
            </p>
          )}
          <p className={styles.finePrint}>
            Free plan available · No credit card required
          </p>
        </div>

        <div className={styles.heroCard} aria-hidden="true">
          <img
            src="/images/Website_Hero_Logo.png"
            alt=""
            className={styles.heroLogo}
          />
          <div className={styles.scoreRing}>
            <span className={styles.scoreValue}>92</span>
            <span className={styles.scoreLabel}>Store health</span>
          </div>
          <ul className={styles.miniBars}>
            {[
              ["Products", 88],
              ["SEO", 74],
              ["Images", 95],
              ["Inventory", 90],
              ["Collections", 100],
            ].map(([label, val]) => (
              <li key={label as string}>
                <span>{label}</span>
                <span className={styles.track}>
                  <span
                    className={styles.fill}
                    style={{ width: `${val as number}%` }}
                  />
                </span>
                <b>{val}</b>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="features" className={styles.section}>
        <h2 className={styles.sectionTitle}>Everything to keep your store healthy</h2>
        <div className={styles.grid}>
          {FEATURES.map((f) => (
            <div key={f.title} className={styles.feature}>
              <img src={f.icon} alt="" className={styles.featureIcon} />
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className={styles.section}>
        <h2 className={styles.sectionTitle}>How it works</h2>
        <div className={styles.steps}>
          {STEPS.map((s) => (
            <div key={s.n} className={styles.step}>
              <span className={styles.stepNum}>{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} CorePilot AI · CoreWital</span>
        <span className={styles.footerLinks}>
          <Link to="/admin/login">Admin login</Link>
        </span>
      </footer>
    </div>
  );
}
