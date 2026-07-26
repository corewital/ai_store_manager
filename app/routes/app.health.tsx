import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineGrid,
  Badge,
  Button,
  InlineStack,
  ProgressBar,
} from "@shopify/polaris";
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
  const score = await computeHealthScore(shop.id);
  const catalog = await getCatalogCounts(admin);
  const issueCounts = {
    products: await openCount(productIssues, shop.id),
    seo: await openCount(seoIssues, shop.id),
    images: await openCount(imageIssues, shop.id),
    inventory: await openCount(inventoryFlags, shop.id),
    collections: await openCount(collectionIssues, shop.id),
    navigation: await openCount(navigationIssues, shop.id),
    theme: await openCount(themeIssues, shop.id),
  };
  return { score, issueCounts, modules, catalog };
};

export default function HealthOverview() {
  const { score, issueCounts, modules, catalog } = useLoaderData<typeof loader>();
  const visibleModules = MODULES.filter((m) => {
    const key = m.key as keyof AppModuleVisibility;
    return modules[key] !== false;
  });

  return (
    <Page>
      <TitleBar title="Store Health" />
      <SubNav items={healthNavFor(modules)} />
      <BlockStack gap="500">
        <Card>
          <InlineStack gap="500" blockAlign="center" align="start">
            <ScoreGauge value={score.overall} />
            <BlockStack gap="200">
              <Text as="h2" variant="headingLg">
                Overall health
              </Text>
              <Text as="p" tone="subdued">
                {catalog.products.toLocaleString()} products ·{" "}
                {catalog.collections.toLocaleString()} collections. Fix open
                problems to grow conversions.
              </Text>
              <InlineStack gap="200">
                <Button url="/app/fixes" variant="primary">
                  One-Click Fix
                </Button>
                <Button url="/app">Back to Dashboard</Button>
              </InlineStack>
            </BlockStack>
          </InlineStack>
        </Card>

        <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="300">
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
            const tone =
              open === 0 && score[key] >= 90
                ? ("success" as const)
                : open > 0
                  ? ("warning" as const)
                  : ("info" as const);
            return (
              <Card key={key}>
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="h3" variant="headingSm">
                      {label}
                    </Text>
                    <Badge tone={tone}>
                      {open === 0 ? "Healthy" : `${open} Problems`}
                    </Badge>
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {total > 0
                      ? `${total.toLocaleString()} total · ${open} problems`
                      : `${open} problems`}
                  </Text>
                  <Text as="p" variant="headingLg">
                    Score {score[key]}
                  </Text>
                  <ProgressBar
                    progress={clearPct}
                    size="small"
                    tone={open > 0 ? "critical" : "primary"}
                  />
                  <Button url={href} size="slim" fullWidth>
                    Review &amp; fix
                  </Button>
                </BlockStack>
              </Card>
            );
          })}
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}
