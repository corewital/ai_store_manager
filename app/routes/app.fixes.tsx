import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  Button,
  BlockStack,
  Banner,
  InlineStack,
  Text,
  Badge,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { and, count, eq, isNull } from "drizzle-orm";
import { authenticate } from "../shopify.server";
import { db } from "../db/client";
import { fixQueue } from "../db/schema";
import { ensureShop } from "../services/shopify/shops.server";
import { enqueueShopFixes } from "../services/shopify/shop-jobs.server";
import { DataTable } from "../components/datatable/DataTable";
import { REPORTS_NAV, SubNav } from "../components/SubNav";
import { requireAppModule } from "../services/shopify/require-module.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAppModule("fixes");
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);

  const [{ pending }] = await db
    .select({ pending: count() })
    .from(fixQueue)
    .where(
      and(
        eq(fixQueue.shopId, shop.id),
        eq(fixQueue.status, "pending"),
        isNull(fixQueue.deletedAt),
      ),
    );

  return { pending };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);

  const form = await request.formData();
  if (form.get("intent") !== "fixAll") return { ok: false };

  const jobs = await db.query.fixQueue.findMany({
    where: and(
      eq(fixQueue.shopId, shop.id),
      eq(fixQueue.status, "pending"),
      isNull(fixQueue.deletedAt),
    ),
    limit: 50,
  });

  // Group by module and re-queue for cron (real Shopify fixes, not just mark done)
  const byModule = new Map<string, number[]>();
  for (const job of jobs) {
    if (!job.issueId) continue;
    const list = byModule.get(job.module) || [];
    list.push(job.issueId);
    byModule.set(job.module, list);
  }

  let queued = 0;
  for (const [module, ids] of byModule) {
    const result = await enqueueShopFixes(shop.id, module, ids);
    if (result.ok) queued += result.queued;
  }

  return { ok: true, queued, pendingFound: jobs.length };
};

export default function FixesPage() {
  const { pending } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  return (
    <Page>
      <TitleBar title="One-Click Fix" />
      <SubNav items={REPORTS_NAV} />
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              How One-Click Fix works
            </Text>
            <Text as="p" tone="subdued">
              Issues found by scans (Products, SEO, Images, …) can be fixed one
              by one on each module page, or queued here in bulk. Single Fix runs
              immediately; Fix selected / Fix All run in the background via cron
              so large stores stay fast. Pending jobs appear in the table below.
            </Text>
            <InlineStack gap="200" blockAlign="center">
              <Badge tone={pending > 0 ? "attention" : "success"}>
                {String(pending) + " pending"}
              </Badge>
              <Text as="span" tone="subdued" variant="bodySm">
                Open a module (e.g. Products) → Fix, or queue bulk from here.
              </Text>
            </InlineStack>
          </BlockStack>
        </Card>

        {fetcher.data?.ok && (
          <Banner tone="success">
            Queued {(fetcher.data as { queued?: number }).queued ?? 0} fix job(s)
            for background processing.
          </Banner>
        )}

        <InlineStack align="end">
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="fixAll" />
            <Button
              submit
              variant="primary"
              loading={fetcher.state !== "idle"}
              disabled={pending === 0}
            >
              Queue all pending ({String(pending)})
            </Button>
          </fetcher.Form>
        </InlineStack>

        <Card>
          <DataTable
            table="fixQueue"
            endpoint="/api/app/datatable"
            statusFilter
            defaultStatus="pending"
            statusOptions={[
              { label: "Pending", value: "pending" },
              { label: "Done", value: "done" },
              { label: "Failed", value: "failed" },
              { label: "All", value: "all" },
            ]}
            showViewToggle={false}
          />
        </Card>
      </BlockStack>
    </Page>
  );
}
