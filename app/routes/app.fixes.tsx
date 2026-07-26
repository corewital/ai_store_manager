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
  IndexTable,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { authenticate } from "../shopify.server";
import { db } from "../db/client";
import { fixQueue } from "../db/schema";
import { ensureShop } from "../services/shopify/shops.server";
import { enqueueShopFixes } from "../services/shopify/shop-jobs.server";
import { REPORTS_NAV, SubNav } from "../components/SubNav";
import { requireAppModule } from "../services/shopify/require-module.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  await requireAppModule("fixes", shop.id);

  const jobs = await db.query.fixQueue.findMany({
    where: and(eq(fixQueue.shopId, shop.id), isNull(fixQueue.deletedAt)),
    orderBy: [desc(fixQueue.updatedAt)],
    limit: 100,
  });

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

  return {
    pending,
    jobs: jobs.map((j) => ({
      id: j.id,
      module: j.module,
      action: j.action,
      issueId: j.issueId,
      status: j.status,
      errorMessage: j.errorMessage,
      payloadJson: j.payloadJson,
      updatedAt: j.updatedAt ? new Date(j.updatedAt).toISOString() : null,
    })),
  };
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

function toneFor(status: string) {
  if (status === "done") return "success" as const;
  if (status === "failed") return "critical" as const;
  if (status === "pending") return "attention" as const;
  return undefined;
}

export default function FixesPage() {
  const { pending, jobs } = useLoaderData<typeof loader>();
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
              Scans find issues across Products, SEO, Images, Collections, and
              more. Fix one item on a module page (instant), or queue bulk fixes
              here — they run immediately in the background. The table below
              shows every queued, completed, and failed fix with details.
            </Text>
            <InlineStack gap="200" blockAlign="center">
              <Badge tone={pending > 0 ? "attention" : "success"}>
                {String(pending) + " pending"}
              </Badge>
              <Text as="span" tone="subdued" variant="bodySm">
                {jobs.length} recent jobs · open a module to create new fixes
              </Text>
            </InlineStack>
          </BlockStack>
        </Card>

        {fetcher.data?.ok && (
          <Banner tone="success">
            Processed {(fetcher.data as { queued?: number }).queued ?? 0}{" "}
            fix job(s).
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
              Run all pending ({String(pending)})
            </Button>
          </fetcher.Form>
        </InlineStack>

        <Card padding="0">
          {jobs.length === 0 ? (
            <div style={{ padding: "1.25rem" }}>
              <Text as="p" tone="subdued">
                No fix jobs yet. Run a store scan, then open Products / SEO /
                Images and use Fix on open issues — they will appear here.
              </Text>
            </div>
          ) : (
            <IndexTable
              resourceName={{ singular: "job", plural: "jobs" }}
              itemCount={jobs.length}
              selectable={false}
              headings={[
                { title: "Module" },
                { title: "Action" },
                { title: "Issue" },
                { title: "Status" },
                { title: "Detail" },
                { title: "Updated" },
              ]}
            >
              {jobs.map((j, i) => (
                <IndexTable.Row id={String(j.id)} key={j.id} position={i}>
                  <IndexTable.Cell>
                    <Text as="span" fontWeight="semibold">
                      {j.module}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{j.action || "—"}</IndexTable.Cell>
                  <IndexTable.Cell>
                    {j.issueId != null ? `#${j.issueId}` : "—"}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={toneFor(j.status)}>{j.status}</Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" tone="subdued" variant="bodySm">
                      {(j.errorMessage || j.payloadJson || "—").slice(0, 120)}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {j.updatedAt
                      ? new Date(j.updatedAt).toLocaleString()
                      : "—"}
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
