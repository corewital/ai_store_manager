import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  EmptyState,
  IndexTable,
  ProgressBar,
  Layout,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { desc, eq } from "drizzle-orm";
import { authenticate } from "../shopify.server";
import { db } from "../db/client";
import { performanceSnapshots } from "../db/schema";
import { ensureShop } from "../services/shopify/shops.server";
import {
  scanPerformance,
  type PerformanceMetrics,
} from "../services/scanners/performance-scanner.server";
import { ScoreGauge } from "../components/ScoreGauge";
import { healthNavFor, SubNav } from "../components/SubNav";
import { requireAppModule } from "../services/shopify/require-module.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  const modules = await requireAppModule("performance", shop.id);

  let metrics: PerformanceMetrics | null = null;
  let suggestions: string[] = [];
  let scannedAt: string | null = null;

  try {
    const snap = await db.query.performanceSnapshots.findFirst({
      where: eq(performanceSnapshots.shopId, shop.id),
      orderBy: [desc(performanceSnapshots.scannedAt)],
    });
    if (snap?.metricsJson) {
      const parsed = JSON.parse(snap.metricsJson);
      if (Array.isArray(parsed?.pages)) metrics = parsed as PerformanceMetrics;
    }
    if (snap?.suggestionsJson) {
      const parsed = JSON.parse(snap.suggestionsJson);
      suggestions = Array.isArray(parsed) ? parsed : [];
    }
    scannedAt = snap?.scannedAt ? new Date(snap.scannedAt).toISOString() : null;
  } catch {
    metrics = null;
  }

  return { metrics, suggestions, scannedAt, modules };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  try {
    const metrics = await scanPerformance(shop.id, admin);
    return { ok: true, score: metrics?.speedScore ?? 0 };
  } catch {
    return { ok: false };
  }
};

function toneFor(score: number) {
  if (score >= 80) return "success" as const;
  if (score >= 50) return "warning" as const;
  return "critical" as const;
}

export default function PerformancePage() {
  const { metrics, suggestions, scannedAt, modules } = useLoaderData<typeof loader>();
  const scan = useFetcher<typeof action>();

  return (
    <Page>
      <TitleBar title="Store Performance" />
      <SubNav items={healthNavFor(modules)} />
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              What Performance checks
            </Text>
            <Text as="p" tone="subdued">
              We fetch your storefront homepage, a collection page, and a product
              page, then estimate weight (HTML, images, JS, CSS, fonts) and a
              speed score. Heavy images and third-party scripts usually hurt the
              score. Re-scan after you compress images or remove unused apps.
              Pixel optimize is under Images (sharp) — this page does not rewrite
              your theme automatically.
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Tip: Fix oversized product images first, then re-run Performance to
              see daily improvement.
            </Text>
          </BlockStack>
        </Card>
        {scan.data && !scan.data.ok && (
          <Banner tone="critical">Scan failed. Try again.</Banner>
        )}

        {!metrics ? (
          <Card>
            <EmptyState
              heading="No performance data yet"
              action={{
                content: scan.state !== "idle" ? "Scanning…" : "Run scan",
                onAction: () => scan.submit({}, { method: "post" }),
                loading: scan.state !== "idle",
              }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>
                We measure homepage, collection, and product page weight to
                estimate storefront speed.
              </p>
            </EmptyState>
          </Card>
        ) : (
          <Layout>
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="400" inlineAlign="center">
                  <Text as="h2" variant="headingMd">
                    Speed score
                  </Text>
                  <ScoreGauge value={metrics.speedScore} />
                  <Badge tone={toneFor(metrics.speedScore)}>
                    {metrics.speedScore >= 80
                      ? "Fast"
                      : metrics.speedScore >= 50
                        ? "Medium"
                        : "Slow"}
                  </Badge>
                  {scannedAt && (
                    <Text as="p" tone="subdued" variant="bodySm">
                      Last scan {new Date(scannedAt).toLocaleString()}
                    </Text>
                  )}
                  <scan.Form method="post">
                    <Button submit variant="primary" loading={scan.state !== "idle"}>
                      Rescan
                    </Button>
                  </scan.Form>
                </BlockStack>
              </Card>
            </Layout.Section>

            <Layout.Section>
              <BlockStack gap="400">
                <Card>
                  <BlockStack gap="300">
                    <Text as="h2" variant="headingMd">
                      Page breakdown
                    </Text>
                    {metrics.pages.map((p) => (
                      <BlockStack key={p.url} gap="200">
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                            {p.pageType}
                          </Text>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {p.totalKb} KB · {p.requestCount} requests ·{" "}
                            {p.speedScore}/100
                          </Text>
                        </InlineStack>
                        <ProgressBar
                          progress={p.speedScore}
                          size="small"
                          tone={p.speedScore < 50 ? "critical" : "primary"}
                        />
                        <Text as="p" variant="bodySm" tone="subdued">
                          Images {p.imageKb} KB · JS {p.jsKb} KB · CSS {p.cssKb} KB
                          · Fonts {p.fontKb} KB · {p.thirdPartyCount} third-party
                        </Text>
                      </BlockStack>
                    ))}
                  </BlockStack>
                </Card>

                <Card padding="0">
                  <div style={{ padding: "1rem 1rem 0" }}>
                    <Text as="h2" variant="headingMd">
                      Largest assets
                    </Text>
                  </div>
                  <IndexTable
                    resourceName={{ singular: "asset", plural: "assets" }}
                    itemCount={metrics.largestAssets.length}
                    headings={[
                      { title: "Asset" },
                      { title: "Type" },
                      { title: "Size" },
                    ]}
                    selectable={false}
                  >
                    {metrics.largestAssets.map((a, i) => (
                      <IndexTable.Row id={a.url} key={a.url} position={i}>
                        <IndexTable.Cell>
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ wordBreak: "break-all" }}
                          >
                            {a.url.split("/").pop()}
                          </a>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Badge>{a.type}</Badge>
                        </IndexTable.Cell>
                        <IndexTable.Cell>{a.sizeKb} KB</IndexTable.Cell>
                      </IndexTable.Row>
                    ))}
                  </IndexTable>
                </Card>

                {suggestions.length > 0 && (
                  <Card>
                    <BlockStack gap="300">
                      <Text as="h2" variant="headingMd">
                        Suggestions
                      </Text>
                      {suggestions.map((s, i) => (
                        <InlineStack
                          key={i}
                          align="space-between"
                          blockAlign="center"
                          gap="300"
                        >
                          <Text as="span" variant="bodyMd">
                            {s}
                          </Text>
                          {s.toLowerCase().includes("image") && (
                            <Button url="/app/images" size="slim">
                              Fix images
                            </Button>
                          )}
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </Card>
                )}
              </BlockStack>
            </Layout.Section>
          </Layout>
        )}
      </BlockStack>
    </Page>
  );
}
