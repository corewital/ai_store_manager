import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  EmptyState,
  IndexTable,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { desc, eq } from "drizzle-orm";
import { authenticate } from "../shopify.server";
import { db } from "../db/client";
import { installedAppsSnapshot } from "../db/schema";
import { ensureShop } from "../services/shopify/shops.server";
import { scanApps, type AppBlockRow } from "../services/scanners/apps-scanner.server";
import { healthNavFor, SubNav } from "../components/SubNav";
import { requireAppModule } from "../services/shopify/require-module.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const modules = await requireAppModule("apps");
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);

  let apps: AppBlockRow[] = [];
  let scannedAt: string | null = null;
  try {
    const snap = await db.query.installedAppsSnapshot.findFirst({
      where: eq(installedAppsSnapshot.shopId, shop.id),
      orderBy: [desc(installedAppsSnapshot.scannedAt)],
    });
    if (snap?.snapshotJson) {
      const parsed = JSON.parse(snap.snapshotJson);
      apps = Array.isArray(parsed?.apps) ? parsed.apps : [];
    }
    scannedAt = snap?.scannedAt ? new Date(snap.scannedAt).toISOString() : null;
  } catch {
    apps = [];
  }

  return { apps: Array.isArray(apps) ? apps : [], scannedAt, modules };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  try {
    const apps = await scanApps(shop.id, admin);
    return { ok: true, found: apps.length };
  } catch {
    return { ok: false };
  }
};

export default function AppsPage() {
  const { apps, scannedAt, modules } = useLoaderData<typeof loader>();
  const rescan = useFetcher<typeof action>();
  const rows = Array.isArray(apps) ? apps : [];

  return (
    <Page>
      <TitleBar title="Apps Auditor" />
      <SubNav items={healthNavFor(modules)} />
      <BlockStack gap="400">
        <Banner tone="info">
          Shopify does not expose a full installed-apps list to third-party
          apps. This audits app blocks and embeds visible in your live theme.
        </Banner>
        {rescan.data?.ok && (
          <Banner tone="success">
            Rescan complete — {(rescan.data as { found?: number }).found ?? 0}{" "}
            app blocks found.
          </Banner>
        )}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Theme app blocks
              </Text>
              <InlineStack gap="200" blockAlign="center">
                {scannedAt && (
                  <Text as="span" tone="subdued" variant="bodySm">
                    Last scan {new Date(scannedAt).toLocaleString()}
                  </Text>
                )}
                <rescan.Form method="post">
                  <Button submit loading={rescan.state !== "idle"}>
                    Rescan
                  </Button>
                </rescan.Form>
              </InlineStack>
            </InlineStack>

            {rows.length === 0 ? (
              <EmptyState
                heading="No app blocks detected"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Run a scan to audit app blocks in your published theme.</p>
              </EmptyState>
            ) : (
              <IndexTable
                resourceName={{ singular: "app block", plural: "app blocks" }}
                itemCount={rows.length}
                headings={[
                  { title: "App block" },
                  { title: "Type" },
                  { title: "Status" },
                ]}
                selectable={false}
              >
                {rows.map((app, index) => (
                  <IndexTable.Row id={app.id} key={app.id} position={index}>
                    <IndexTable.Cell>
                      <Text as="span" fontWeight="semibold">
                        {app.title}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{app.type}</IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={app.used ? "success" : "attention"}>
                        {app.used ? "In use" : "Not used — can remove"}
                      </Badge>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
