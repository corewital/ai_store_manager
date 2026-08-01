import type { LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { Page, Text, Badge, Button } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { and, count, eq, isNull } from "drizzle-orm";
import { authenticate } from "../shopify.server";
import { db } from "../db/client";
import {
  collectionIssues,
  imageIssues,
  inventoryFlags,
  navigationIssues,
  productIssues,
  seoIssues,
  themeIssues,
} from "../db/schema";
import {
  computeHealthScore,
  type HealthCategory,
} from "../services/scoring/health-score.server";
import { ensureShop } from "../services/shopify/shops.server";
import { healthNavFor, SubNav } from "../components/SubNav";
import { ScoreGauge } from "../components/ScoreGauge";
import { requireAppModule } from "../services/shopify/require-module.server";
import type { AppModuleVisibility } from "../services/admin/module-visibility";
import { getCatalogCounts } from "../services/shopify/catalog.server";
import healthCss from "../styles/health.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: healthCss }];

const MODULES: {
  key: HealthCategory;
  label: string;
  href: string;
  countKey?:
    | "products"
    | "seo"
    | "images"
    | "inventory"
    | "collections"
    | "navigation"
    | "theme";
}[] = [
  { key: "products", label: "Products", href: "/app/products", countKey: "products" },
  { key: "seo", label: "SEO", href: "/app/seo", countKey: "seo" },
  { key: "images", label: "Images", href: "/app/images", countKey: "images" },
  { key: "inventory", label: "Inventory", href: "/app/inventory", countKey: "inventory" },
  { key: "collections", label: "Collections", href: "/app/collections", countKey: "collections" },
  { key: "navigation", label: "Navigation", href: "/app/navigation", countKey: "navigation" },
  { key: "theme", label: "Theme", href: "/app/theme", countKey: "theme" },
  { key: "apps", label: "Apps", href: "/app/apps" },
  { key: "performance", label: "Performance", href: "/app/performance" },
];

async function openCount(
  table:
    | typeof productIssues
    | typeof seoIssues
    | typeof imageIssues
    | typeof inventoryFlags
    | typeof collectionIssues
    | typeof navigationIssues
    | typeof themeIssues,
  shopId: number,
) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(table)
    .where(
      and(eq(table.shopId, shopId), eq(table.status, "open"), isNull(table.deletedAt)),
    );
  return n;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const modules = await requireAppModule("health");
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  const [score, catalog, products, seo, images, inventory, collections, navigation, theme] =
    await Promise.all([
      computeHealthScore(shop.id),
      getCatalogCounts(admin),
      openCount(productIssues, shop.id),
      openCount(seoIssues, shop.id),
      openCount(imageIssues, shop.id),
      openCount(inventoryFlags, shop.id),
      openCount(collectionIssues, shop.id),
      openCount(navigationIssues, shop.id),
      openCount(themeIssues, shop.id),
    ]);
  return {
    score,
    modules,
    catalog,
    issueCounts: {
      products,
      seo,
      images,
      inventory,
      collections,
      navigation,
      theme,
    },
  };
};

export default function HealthOverview() {
  const { score, issueCounts, modules, catalog } = useLoaderData<typeof loader>();
  const visibleModules = MODULES.filter((m) => {
    const key = m.key as keyof AppModuleVisibility;
    return modules[key] !== false;
  });
  const totalOpen = Object.values(issueCounts).reduce((a, b) => a + b, 0);

  return (
    <Page fullWidth>
      <TitleBar title="Store Health" />
      <SubNav items={healthNavFor(modules)} />
      <div className="cp-health">
        <section className="cp-health-hero">
          <div className="cp-health-hero__glow" aria-hidden />
          <ScoreGauge value={score.overall} size={140} />
          <div className="cp-health-hero__copy">
            <Text as="h2" variant="headingXl">
              Overall health {score.overall}
            </Text>
            <Text as="p" tone="subdued">
              {catalog.products.toLocaleString()} products ·{" "}
              {catalog.collections.toLocaleString()} collections · {totalOpen} open
              issue{totalOpen === 1 ? "" : "s"}
            </Text>
            <div className="cp-health-hero__actions">
              <Link to="/app/fixes">
                <Button variant="primary">One-Click Fix</Button>
              </Link>
              <Link to="/app">
                <Button>Dashboard</Button>
              </Link>
            </div>
          </div>
        </section>

        <div className="cp-health-grid">
          {visibleModules.map(({ key, label, href, countKey }) => {
            const open = countKey ? issueCounts[countKey] : 0;
            const total =
              key === "collections"
                ? catalog.collections
                : ["products", "seo", "images", "inventory"].includes(key)
                  ? catalog.products
                  : open;
            const clearPct =
              total > 0
                ? Math.round(((total - Math.min(open, total)) / total) * 100)
                : score[key];
            return (
              <Link key={key} to={href} className={`cp-health-card${open > 0 ? " has-issues" : ""}`}>
                <div className="cp-health-card__top">
                  <span className="cp-health-card__label">{label}</span>
                  <Badge tone={open > 0 ? "warning" : "success"}>
                    {open === 0 ? "Healthy" : `${open} open`}
                  </Badge>
                </div>
                <p className="cp-health-card__score">{score[key]}</p>
                <p className="cp-health-card__meta">
                  {total > 0
                    ? `${total.toLocaleString()} total · ${clearPct}% clear`
                    : `${open} to review`}
                </p>
                <div className="cp-health-bar">
                  <span style={{ width: `${clearPct}%` }} />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </Page>
  );
}
