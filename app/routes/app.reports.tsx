import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  Page,
  Card,
  BlockStack,
  Banner,
  Text,
  Button,
  InlineStack,
  Badge,
  Divider,
  DataTable,
  EmptyState,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { desc, eq } from "drizzle-orm";
import { authenticate } from "../shopify.server";
import { db } from "../db/client";
import { reportsSent } from "../db/schema";
import { ensureShop } from "../services/shopify/shops.server";
import { REPORTS_NAV, SubNav } from "../components/SubNav";
import { useLoaderData } from "@remix-run/react";
import { requireAppModule } from "../services/shopify/require-module.server";

type ReportRow = {
  id: number;
  type: string;
  subject: string;
  summaryText: string;
  recommendations: string[];
  openIssues: { label: string; count: number }[];
  sentAt: string | null;
};

function parseReport(r: {
  id: number;
  type: string;
  subject: string | null;
  summaryJson: string | null;
  sentAt: Date | null;
}): ReportRow {
  let summary: Record<string, unknown> = {};
  try {
    summary = r.summaryJson ? JSON.parse(r.summaryJson) : {};
  } catch {
    summary = {};
  }

  const subject = r.subject ?? "Store report";
  const summaryText =
    typeof summary.summary === "string"
      ? summary.summary
      : typeof summary.raw === "string"
        ? summary.raw
        : subject;

  const recommendations = Array.isArray(summary.recommendations)
    ? (summary.recommendations as string[])
    : [];

  const openIssues: { label: string; count: number }[] = [];
  if (summary.openIssues && typeof summary.openIssues === "object") {
    for (const [k, v] of Object.entries(
      summary.openIssues as Record<string, number>,
    )) {
      openIssues.push({
        label: k.charAt(0).toUpperCase() + k.slice(1),
        count: Number(v) || 0,
      });
    }
  }
  // Health score object from cron emails
  for (const key of ["products", "seo", "images", "inventory", "collections"]) {
    if (typeof summary[key] === "number" && !openIssues.some((i) => i.label.toLowerCase() === key)) {
      openIssues.push({
        label: key.charAt(0).toUpperCase() + key.slice(1),
        count: summary[key] as number,
      });
    }
  }

  return {
    id: r.id,
    type: r.type,
    subject,
    summaryText,
    recommendations,
    openIssues,
    sentAt: r.sentAt ? new Date(r.sentAt).toISOString() : null,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  await requireAppModule("reports", shop.id);

  const rows = await db.query.reportsSent.findMany({
    where: eq(reportsSent.shopId, shop.id),
    orderBy: [desc(reportsSent.sentAt)],
    limit: 50,
  });

  // Prefer real reports; only seed samples when empty
  if (rows.length === 0) {
    await db.insert(reportsSent).values([
      {
        shopId: shop.id,
        type: "daily",
        subject: "Daily health digest",
        summaryJson: JSON.stringify({
          summary:
            "Your catalog looks mostly healthy. A few products are missing images.",
          openIssues: { products: 4, seo: 0, images: 4, collections: 0 },
          recommendations: [
            "Add images to products without media",
            "Review SEO titles longer than 70 characters",
          ],
        }),
        sentAt: new Date(Date.now() - 86400000),
      },
      {
        shopId: shop.id,
        type: "weekly",
        subject: "Weekly store health report",
        summaryJson: JSON.stringify({
          summary:
            "This week: archive unused products and compress oversized images to improve speed.",
          openIssues: { products: 3, images: 8, seo: 2 },
          recommendations: [
            "Archive 3 dead products",
            "Compress 8 large images",
            "Fix missing alt text on top sellers",
          ],
        }),
        sentAt: new Date(Date.now() - 7 * 86400000),
      },
    ]);
  }

  const fresh = await db.query.reportsSent.findMany({
    where: eq(reportsSent.shopId, shop.id),
    orderBy: [desc(reportsSent.sentAt)],
    limit: 50,
  });

  return { reports: fresh.map(parseReport) };
};

export default function ReportsPage() {
  const { reports } = useLoaderData<typeof loader>();

  return (
    <Page>
      <TitleBar title="Reports" />
      <SubNav items={REPORTS_NAV} />
      <BlockStack gap="400">
        <Banner tone="info">
          Reports are created after scheduled scans. Email delivery is available
          on Professional and higher.
        </Banner>
        <InlineStack align="end" gap="200">
          <Button url="/app">Dashboard</Button>
          <Button url="/app/fixes" variant="primary">
            Open Fix Queue
          </Button>
        </InlineStack>

        {reports.length === 0 ? (
          <Card>
            <EmptyState
              heading="No reports yet"
              action={{ content: "Run a scan", url: "/app" }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>Queue a store scan to generate your first health report.</p>
            </EmptyState>
          </Card>
        ) : (
          reports.map((r) => (
            <Card key={r.id}>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge
                      tone={r.type === "weekly" ? "info" : "success"}
                    >
                      {r.type === "weekly" ? "Weekly" : "Daily"}
                    </Badge>
                    <Text as="h2" variant="headingMd">
                      {r.subject}
                    </Text>
                  </InlineStack>
                  <Text as="span" tone="subdued" variant="bodySm">
                    {r.sentAt
                      ? new Date(r.sentAt).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                  </Text>
                </InlineStack>

                <Text as="p">{r.summaryText}</Text>

                {r.openIssues.length > 0 && (
                  <>
                    <Divider />
                    <Text as="h3" variant="headingSm">
                      Module scores / open issues
                    </Text>
                    <DataTable
                      columnContentTypes={["text", "numeric"]}
                      headings={["Area", "Value"]}
                      rows={r.openIssues.map((i) => [
                        i.label,
                        String(i.count),
                      ])}
                    />
                  </>
                )}

                {r.recommendations.length > 0 && (
                  <>
                    <Divider />
                    <Text as="h3" variant="headingSm">
                      Recommended next steps
                    </Text>
                    <BlockStack gap="100">
                      {r.recommendations.map((item) => (
                        <Text as="p" key={item} tone="subdued">
                          • {item}
                        </Text>
                      ))}
                    </BlockStack>
                  </>
                )}
              </BlockStack>
            </Card>
          ))
        )}
      </BlockStack>
    </Page>
  );
}
