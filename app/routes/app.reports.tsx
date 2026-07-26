import type { LoaderFunctionArgs } from "@remix-run/node";
import { Page, Card, BlockStack, Banner, Text, Button, InlineStack, Badge, Divider } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { desc, eq } from "drizzle-orm";
import { authenticate } from "../shopify.server";
import { db } from "../db/client";
import { reportsSent } from "../db/schema";
import { ensureShop } from "../services/shopify/shops.server";
import { REPORTS_NAV, SubNav } from "../components/SubNav";
import { useLoaderData } from "@remix-run/react";
import { requireAppModule } from "../services/shopify/require-module.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  await requireAppModule("reports", shop.id);

  let rows = await db.query.reportsSent.findMany({
    where: eq(reportsSent.shopId, shop.id),
    orderBy: [desc(reportsSent.sentAt)],
    limit: 50,
  });

  if (rows.length === 0) {
    await db.insert(reportsSent).values([
      {
        shopId: shop.id,
        type: "daily",
        subject: "Daily health digest (sample)",
        summaryJson: JSON.stringify({
          summary: "Sample: 4 products missing images, SEO stable.",
          openIssues: { products: 4, seo: 0, images: 4 },
        }),
        sentAt: new Date(Date.now() - 86400000),
      },
      {
        shopId: shop.id,
        type: "weekly",
        subject: "Weekly AI report (sample)",
        summaryJson: JSON.stringify({
          summary: "Sample: Archive 3 dead products. Compress 8 large images.",
          recommendations: ["Fix missing alt text", "Shorten long SEO titles"],
        }),
        sentAt: new Date(Date.now() - 7 * 86400000),
      },
    ]);
    rows = await db.query.reportsSent.findMany({
      where: eq(reportsSent.shopId, shop.id),
      orderBy: [desc(reportsSent.sentAt)],
      limit: 50,
    });
  }

  return {
    reports: rows.map((r) => {
      let summary: Record<string, unknown> = {};
      try {
        summary = r.summaryJson ? JSON.parse(r.summaryJson) : {};
      } catch {
        summary = { raw: r.summaryJson };
      }
      return {
        id: r.id,
        type: r.type,
        subject: r.subject,
        summary,
        sentAt: r.sentAt ? new Date(r.sentAt).toISOString() : null,
      };
    }),
  };
};

export default function ReportsPage() {
  const { reports } = useLoaderData<typeof loader>();

  return (
    <Page>
      <TitleBar title="Reports" />
      <SubNav items={REPORTS_NAV} />
      <BlockStack gap="400">
        <Banner tone="info">
          Daily and weekly reports are generated after scans (and emailed on
          Professional+). Full details for each report are listed below.
        </Banner>
        <InlineStack align="end">
          <Button url="/app/fixes">Open Fix Queue</Button>
        </InlineStack>

        {reports.map((r) => (
          <Card key={r.id}>
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Badge>{r.type}</Badge>
                  <Text as="h3" variant="headingMd">
                    {r.subject}
                  </Text>
                </InlineStack>
                <Text as="span" tone="subdued" variant="bodySm">
                  {r.sentAt ? new Date(r.sentAt).toLocaleString() : "—"}
                </Text>
              </InlineStack>
              <Divider />
              {typeof r.summary.summary === "string" && (
                <Text as="p">{r.summary.summary}</Text>
              )}
              {Array.isArray(r.summary.recommendations) && (
                <BlockStack gap="100">
                  <Text as="p" fontWeight="semibold">
                    Recommendations
                  </Text>
                  {(r.summary.recommendations as string[]).map((item) => (
                    <Text as="p" key={item} tone="subdued">
                      • {item}
                    </Text>
                  ))}
                </BlockStack>
              )}
              {r.summary.openIssues && typeof r.summary.openIssues === "object" && (
                <Text as="p" tone="subdued" variant="bodySm">
                  Open issues:{" "}
                  {Object.entries(
                    r.summary.openIssues as Record<string, number>,
                  )
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")}
                </Text>
              )}
              <details>
                <summary style={{ cursor: "pointer", fontSize: 13 }}>
                  Full JSON
                </summary>
                <pre style={{ fontSize: 12, overflow: "auto" }}>
                  {JSON.stringify(r.summary, null, 2)}
                </pre>
              </details>
            </BlockStack>
          </Card>
        ))}
      </BlockStack>
    </Page>
  );
}
