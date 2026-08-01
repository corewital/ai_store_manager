import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, useSearchParams } from "@remix-run/react";
import { useState } from "react";
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
  Modal,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { authenticate } from "../shopify.server";
import { db } from "../db/client";
import {
  collectionIssues,
  fixQueue,
  imageIssues,
  inventoryFlags,
  productIssues,
  seoIssues,
} from "../db/schema";
import { ensureShop } from "../services/shopify/shops.server";
import { enqueueShopFixes } from "../services/shopify/shop-jobs.server";
import { REPORTS_NAV, SubNav } from "../components/SubNav";
import { requireAppModule } from "../services/shopify/require-module.server";
import { merchantSafeError } from "../lib/errors.server";
import { issueLabel } from "../lib/issue-labels";
import { ResourceImage } from "../components/ResourceImage";

const PAGE_SIZE = 15;

type IssueLite = {
  id: number;
  title: string;
  issueCode: string;
  resourceId: string | null;
  detailsJson: string | null;
};

function parseDetails(raw: string | null | undefined) {
  if (!raw) return {} as Record<string, unknown>;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function shopifyLink(
  shopDomain: string,
  module: string,
  resourceId?: string | null,
  productId?: string | null,
) {
  const store = shopDomain.replace(/\.myshopify\.com$/i, "").split(".")[0];
  if (!store) return null;
  const num = (gid: string) => gid.split("/").pop() || gid;
  if (productId) {
    return `https://admin.shopify.com/store/${store}/products/${num(productId)}`;
  }
  if (!resourceId) return null;
  if (module === "collections" || /Collection/i.test(resourceId)) {
    return `https://admin.shopify.com/store/${store}/collections/${num(resourceId)}`;
  }
  if (/Product/i.test(resourceId) || module === "products" || module === "seo") {
    return `https://admin.shopify.com/store/${store}/products/${num(resourceId)}`;
  }
  return `https://admin.shopify.com/store/${store}/products`;
}

async function loadIssuesByModule(
  module: string,
  ids: number[],
): Promise<Map<number, IssueLite>> {
  const map = new Map<number, IssueLite>();
  if (ids.length === 0) return map;
  const table =
    module === "products"
      ? productIssues
      : module === "seo"
        ? seoIssues
        : module === "images"
          ? imageIssues
          : module === "collections"
            ? collectionIssues
            : module === "inventory"
              ? inventoryFlags
              : null;
  if (!table) return map;
  const rows = await db
    .select({
      id: table.id,
      title: table.title,
      issueCode: table.issueCode,
      resourceId: table.resourceId,
      detailsJson: table.detailsJson,
    })
    .from(table)
    .where(inArray(table.id, ids));
  for (const r of rows) map.set(r.id, r);
  return map;
}

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

  const [[{ total }], jobs, [{ pending }], [{ done }], [{ failed }]] =
    await Promise.all([
      db.select({ total: count() }).from(fixQueue).where(and(...conditions)),
      db.query.fixQueue.findMany({
        where: and(...conditions),
        orderBy: [desc(fixQueue.updatedAt)],
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
      db
        .select({ pending: count() })
        .from(fixQueue)
        .where(
          and(
            eq(fixQueue.shopId, shop.id),
            eq(fixQueue.status, "pending"),
            isNull(fixQueue.deletedAt),
          ),
        ),
      db
        .select({ done: count() })
        .from(fixQueue)
        .where(
          and(
            eq(fixQueue.shopId, shop.id),
            eq(fixQueue.status, "done"),
            isNull(fixQueue.deletedAt),
          ),
        ),
      db
        .select({ failed: count() })
        .from(fixQueue)
        .where(
          and(
            eq(fixQueue.shopId, shop.id),
            eq(fixQueue.status, "failed"),
            isNull(fixQueue.deletedAt),
          ),
        ),
    ]);

  const byModule = new Map<string, number[]>();
  for (const j of jobs) {
    if (j.issueId == null) continue;
    const list = byModule.get(j.module) || [];
    list.push(j.issueId);
    byModule.set(j.module, list);
  }
  const issueMaps = new Map<string, Map<number, IssueLite>>();
  await Promise.all(
    [...byModule.entries()].map(async ([mod, ids]) => {
      issueMaps.set(mod, await loadIssuesByModule(mod, ids));
    }),
  );

  return {
    shopDomain: session.shop,
    pending,
    done,
    failed,
    total,
    page,
    pageSize: PAGE_SIZE,
    status,
    jobs: jobs.map((j) => {
      const issue =
        j.issueId != null
          ? issueMaps.get(j.module)?.get(j.issueId)
          : undefined;
      const details = {
        ...parseDetails(issue?.detailsJson),
        ...parseDetails(j.payloadJson),
      };
      const productTitle =
        (details.productTitle as string) ||
        (details.title as string) ||
        issue?.title ||
        issueLabel(j.action, j.action);
      const imageUrl =
        (details.imageUrl as string) || (details.url as string) || null;
      const before = (details.before as string) || null;
      const after = (details.after as string) || null;
      const field = (details.field as string) || null;
      const resultShort =
        j.status === "done"
          ? after
            ? String(after).slice(0, 80)
            : "Saved to Shopify"
          : j.errorMessage
            ? merchantSafeError(j.errorMessage)
            : "Waiting…";

      return {
        id: j.id,
        module: j.module,
        action: j.action,
        status: j.status,
        productTitle,
        imageUrl,
        sku: (details.sku as string) || null,
        field,
        before,
        after,
        resultShort,
        errorMessage: j.errorMessage ? merchantSafeError(j.errorMessage) : null,
        shopifyUrl: shopifyLink(
          session.shop,
          j.module,
          issue?.resourceId || (details.resourceId as string) || null,
          (details.productId as string) || null,
        ),
        issueCode: issue?.issueCode || null,
        createdAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
        updatedAt: j.updatedAt ? new Date(j.updatedAt).toISOString() : null,
      };
    }),
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
  if (action.startsWith("queued:")) return "Bulk fix";
  return issueLabel(action, action);
}

type JobRow = ReturnType<typeof useLoaderData<typeof loader>>["jobs"][number];

export default function FixesPage() {
  const { pending, done, failed, total, page, pageSize, status, jobs } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<JobRow | null>(null);

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
    <Page fullWidth>
      <TitleBar title="One-Click Fix" />
      <SubNav items={REPORTS_NAV} />
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Fix history
            </Text>
            <Text as="p" tone="subdued">
              Review every AI and manual update — title, image, SKU, and what
              changed. Open Shopify to confirm on the live product or collection.
            </Text>
            <InlineStack gap="200" wrap>
              <Badge tone="attention">{`${pending} pending`}</Badge>
              <Badge tone="success">{`${done} completed`}</Badge>
              <Badge tone="critical">{`${failed} failed`}</Badge>
            </InlineStack>
          </BlockStack>
        </Card>

        {fetcher.data?.ok && (
          <Banner tone="success">
            Started {(fetcher.data as { queued?: number }).queued ?? 0} fix
            {(fetcher.data as { queued?: number }).queued === 1 ? "" : "es"}. We’ll
            finish them in the background.
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
                No fixes yet. Open Products, SEO, Images, or Collections, preview
                a fix, then save — it will show up here.
              </Text>
            </div>
          ) : (
            <>
              <IndexTable
                resourceName={{ singular: "fix", plural: "fixes" }}
                itemCount={jobs.length}
                selectable={false}
                headings={[
                  { title: "Item" },
                  { title: "What ran" },
                  { title: "Status" },
                  { title: "Result" },
                  { title: "Updated" },
                  { title: "" },
                ]}
              >
                {jobs.map((j, i) => (
                  <IndexTable.Row id={String(j.id)} key={j.id} position={i}>
                    <IndexTable.Cell>
                      <InlineStack gap="300" blockAlign="center">
                        <ResourceImage
                          src={j.imageUrl}
                          alt={j.productTitle}
                          size={44}
                        />
                        <BlockStack gap="050">
                          <Text as="span" fontWeight="semibold">
                            {j.productTitle}
                          </Text>
                          <Text as="span" tone="subdued" variant="bodySm">
                            {j.module}
                            {j.sku ? ` · SKU ${j.sku}` : ""}
                            {j.issueCode
                              ? ` · ${issueLabel(j.issueCode)}`
                              : ""}
                          </Text>
                        </BlockStack>
                      </InlineStack>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{actionLabel(j.action)}</IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={toneFor(j.status)}>{j.status}</Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" tone="subdued" variant="bodySm">
                        {j.resultShort}
                        {(j.before || j.after) &&
                        String(j.after || j.before || "").length > 80
                          ? "…"
                          : ""}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {j.updatedAt
                        ? new Date(j.updatedAt).toLocaleString()
                        : "—"}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <InlineStack gap="200">
                        <Button size="slim" onClick={() => setView(j)}>
                          View
                        </Button>
                        {j.shopifyUrl && (
                          <Button
                            size="slim"
                            onClick={() =>
                              window.open(
                                j.shopifyUrl!,
                                "_blank",
                                "noopener,noreferrer",
                              )
                            }
                          >
                            Shopify
                          </Button>
                        )}
                      </InlineStack>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
              {total > pageSize && (
                <div
                  style={{
                    padding: "0.85rem",
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
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

      <Modal
        open={Boolean(view)}
        onClose={() => setView(null)}
        title={view?.productTitle || "Fix details"}
        primaryAction={{ content: "Close", onAction: () => setView(null) }}
        secondaryActions={
          view?.shopifyUrl
            ? [
                {
                  content: "Open in Shopify",
                  onAction: () =>
                    window.open(
                      view.shopifyUrl!,
                      "_blank",
                      "noopener,noreferrer",
                    ),
                },
              ]
            : []
        }
      >
        {view && (
          <Modal.Section>
            <BlockStack gap="300">
              <InlineStack gap="300" blockAlign="start">
                <ResourceImage
                  src={view.imageUrl}
                  alt={view.productTitle}
                  size={72}
                />
                <BlockStack gap="100">
                  <Badge tone={toneFor(view.status)}>{view.status}</Badge>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {view.module} · {actionLabel(view.action)}
                    {view.field ? ` · ${view.field}` : ""}
                  </Text>
                  {view.sku && (
                    <Text as="p" variant="bodySm">
                      SKU: {view.sku}
                    </Text>
                  )}
                </BlockStack>
              </InlineStack>
              {view.before && (
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">
                    Before
                  </Text>
                  <Text as="p" tone="subdued">
                    {view.before}
                  </Text>
                </BlockStack>
              )}
              {view.after && (
                <BlockStack gap="100">
                  <Text as="h3" variant="headingSm">
                    After / saved value
                  </Text>
                  <Text as="p">{view.after}</Text>
                </BlockStack>
              )}
              {view.errorMessage && (
                <Banner tone="critical">{view.errorMessage}</Banner>
              )}
              <Text as="p" variant="bodySm" tone="subdued">
                Updated{" "}
                {view.updatedAt
                  ? new Date(view.updatedAt).toLocaleString()
                  : "—"}
              </Text>
            </BlockStack>
          </Modal.Section>
        )}
      </Modal>
    </Page>
  );
}
