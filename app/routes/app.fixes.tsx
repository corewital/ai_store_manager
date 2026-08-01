import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, useSearchParams } from "@remix-run/react";
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
  Pagination,
  Select,
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
import { merchantSafeError } from "../lib/errors.server";
import { issueLabel } from "../lib/issue-labels";

const PAGE_SIZE = 15;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  await requireAppModule("fixes", shop.id);

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const status = url.searchParams.get("status") || "all";

  const conditions = [
    eq(fixQueue.shopId, shop.id),
    isNull(fixQueue.deletedAt),
  ];
  if (status !== "all") conditions.push(eq(fixQueue.status, status));

  const [{ total }] = await db
    .select({ total: count() })
    .from(fixQueue)
    .where(and(...conditions));

  const jobs = await db.query.fixQueue.findMany({
    where: and(...conditions),
    orderBy: [desc(fixQueue.updatedAt)],
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
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

  const [{ done }] = await db
    .select({ done: count() })
    .from(fixQueue)
    .where(
      and(
        eq(fixQueue.shopId, shop.id),
        eq(fixQueue.status, "done"),
        isNull(fixQueue.deletedAt),
      ),
    );

  const [{ failed }] = await db
    .select({ failed: count() })
    .from(fixQueue)
    .where(
      and(
        eq(fixQueue.shopId, shop.id),
        eq(fixQueue.status, "failed"),
        isNull(fixQueue.deletedAt),
      ),
    );

  return {
    pending,
    done,
    failed,
    total,
    page,
    pageSize: PAGE_SIZE,
    status,
    jobs: jobs.map((j) => ({
      id: j.id,
      module: j.module,
      action: j.action,
      issueId: j.issueId,
      status: j.status,
      errorMessage: j.errorMessage ? merchantSafeError(j.errorMessage) : null,
      payloadJson: j.payloadJson,
      createdAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
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

function actionLabel(action?: string | null) {
  if (!action) return "Fix";
  if (action.startsWith("manual:")) return "Manual save";
  if (action.startsWith("queued:")) return "Bulk queue";
  return issueLabel(action, action);
}

export default function FixesPage() {
  const { pending, done, failed, total, page, pageSize, status, jobs } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [params, setParams] = useSearchParams();

  const setPage = (p: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(p));
    setParams(next);
  };
  const setStatus = (s: string) => {
    const next = new URLSearchParams(params);
    next.set("status", s);
    next.set("page", "1");
    setParams(next);
  };

  return (
    <Page>
      <TitleBar title="One-Click Fix" />
      <SubNav items={REPORTS_NAV} />
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Fix queue & history
            </Text>
            <Text as="p" tone="subdued">
              Every AI or manual fix appears here with module, issue, status, and
              result. Pending jobs can be run in bulk. Failed rows show a clear
              merchant-safe reason — never raw API keys.
            </Text>
            <InlineStack gap="200" wrap>
              <Badge tone="attention">{`${pending} pending`}</Badge>
              <Badge tone="success">{`${done} completed`}</Badge>
              <Badge tone="critical">{`${failed} failed`}</Badge>
              <Text as="span" tone="subdued" variant="bodySm">
                {total} total jobs
              </Text>
            </InlineStack>
          </BlockStack>
        </Card>

        {fetcher.data?.ok && (
          <Banner tone="success">
            Processed {(fetcher.data as { queued?: number }).queued ?? 0} fix
            job(s).
          </Banner>
        )}

        <InlineStack align="space-between" blockAlign="end" wrap>
          <Select
            label="Filter status"
            labelHidden
            options={[
              { label: "All statuses", value: "all" },
              { label: "Pending", value: "pending" },
              { label: "Done", value: "done" },
              { label: "Failed", value: "failed" },
            ]}
            value={status}
            onChange={setStatus}
          />
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
                Images and use Fix — they will appear here with full detail.
              </Text>
            </div>
          ) : (
            <>
              <IndexTable
                resourceName={{ singular: "job", plural: "jobs" }}
                itemCount={jobs.length}
                selectable={false}
                headings={[
                  { title: "Module" },
                  { title: "What ran" },
                  { title: "Issue #" },
                  { title: "Status" },
                  { title: "Result / change" },
                  { title: "Created" },
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
                    <IndexTable.Cell>{actionLabel(j.action)}</IndexTable.Cell>
                    <IndexTable.Cell>
                      {j.issueId != null ? `#${j.issueId}` : "—"}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={toneFor(j.status)}>{j.status}</Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" tone="subdued" variant="bodySm">
                        {j.status === "done"
                          ? "Applied to Shopify"
                          : j.errorMessage || "—"}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {j.createdAt
                        ? new Date(j.createdAt).toLocaleString()
                        : "—"}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {j.updatedAt
                        ? new Date(j.updatedAt).toLocaleString()
                        : "—"}
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
              {total > pageSize && (
                <div style={{ padding: "0.85rem", display: "flex", justifyContent: "center" }}>
                  <Pagination
                    hasPrevious={page > 1}
                    onPrevious={() => setPage(page - 1)}
                    hasNext={page * pageSize < total}
                    onNext={() => setPage(page + 1)}
                  />
                </div>
              )}
            </>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
