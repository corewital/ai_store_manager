import { useCallback, useEffect, useState } from "react";
import { useFetcher, useNavigate } from "@remix-run/react";
import {
  Page,
  Card,
  IndexTable,
  Text,
  Badge,
  Button,
  Banner,
  BlockStack,
  InlineStack,
  Pagination,
  EmptyState,
  Spinner,
  useIndexResourceState,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import { Filters, type FilterState } from "./datatable/Filters";
import { ResourceImage } from "./ResourceImage";
import { ResourceDetailModal, type IssueRow } from "./ResourceDetailModal";
import { HEALTH_NAV, SubNav, healthNavFor } from "./SubNav";
import type { AppModuleVisibility } from "../services/admin/module-visibility";
import { issueLabel, severityLabel } from "../lib/issue-labels";

type Props = {
  title: string;
  table: string;
  module: string;
  shopDomain: string;
  field?: string;
  fieldLabel?: string;
  showImage?: boolean;
  fixLabel?: string;
  emptyMessage?: string;
  lastScannedAt?: string | null;
  modules?: Partial<AppModuleVisibility> | null;
};

type ApiResponse = {
  rows: IssueRow[];
  total: number;
  page: number;
  limit: number;
};

type FixResponse = {
  ok?: boolean;
  queued?: boolean;
  succeeded?: number;
  failed?: number;
  error?: string;
};

const PAGE_SIZE = 20;

function severityTone(severity?: string) {
  if (severity === "high" || severity === "critical") return "critical" as const;
  if (severity === "low") return "info" as const;
  return "warning" as const;
}

export function IssueListPage({
  title,
  table,
  module,
  shopDomain,
  field = "value",
  fieldLabel = "New value",
  showImage = false,
  fixLabel = "Fix",
  emptyMessage = "No issues found — nice job. Run a scan if this looks stale.",
  lastScannedAt = null,
  modules = null,
}: Props) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    status: "open",
  });
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<IssueRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const bulk = useFetcher<FixResponse>();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    });
    try {
      const res = await fetch(`/api/app/datatable/${table}?${qs}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [table, page, filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (bulk.state === "idle" && bulk.data) {
      if (bulk.data.queued) {
        setNotice(
          `Queued ${bulk.data.succeeded ?? 0} fix(es) — cron will process. Buttons unlock when the job finishes.`,
        );
      } else if (bulk.data.error || bulk.data.ok === false) {
        setNotice(bulk.data.error || "Fix failed.");
      } else {
        const done = bulk.data.succeeded ?? 0;
        const failed = bulk.data.failed ?? 0;
        setNotice(
          failed > 0
            ? `Fixed ${done}, ${failed} failed.`
            : `Fixed ${done} issue${done === 1 ? "" : "s"}.`,
        );
      }
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulk.state, bulk.data]);

  const navItems = healthNavFor(modules);

  const rows = Array.isArray(data?.rows) ? data!.rows : [];
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(rows.map((r) => ({ id: String(r.id) })));

  const fixSelected = () => {
    if (selectedResources.length === 0) return;
    bulk.submit(
      { issueIds: selectedResources.join(",") },
      { method: "post", action: `/api/fix/${module}` },
    );
  };

  const headings = [
    { title: "Image" },
    { title: "Product / Issue" },
    { title: "Type" },
    { title: "Severity" },
    { title: "Actions" },
  ];

  const isNoMedia = (row: IssueRow) =>
    module === "products" && row.issueCode === "no_media";

  return (
    <Page fullWidth>
      <TitleBar title={title} />
      <SubNav items={navItems} />
      <BlockStack gap="400">
        <Text as="p" tone="subdued" variant="bodySm">
          {lastScannedAt
            ? `Last scanned ${new Date(lastScannedAt).toLocaleString()}`
            : "No scan yet — run one from the Dashboard"}
        </Text>
        {notice && (
          <Banner
            tone={
              /fail|error|limit|not configured|HTTP |upgrade|could not/i.test(
                notice,
              )
                ? "critical"
                : "success"
            }
            onDismiss={() => setNotice(null)}
          >
            {notice}
          </Banner>
        )}

        <Card>
          <BlockStack gap="300">
            <Filters
              filters={filters}
              onChange={(f) => {
                setFilters(f);
                setPage(1);
              }}
              statusFilter
            />

            {loading && !data ? (
              <InlineStack align="center">
                <Spinner accessibilityLabel="Loading issues" size="small" />
              </InlineStack>
            ) : rows.length === 0 ? (
              <EmptyState
                heading="No open issues"
                action={{
                  content: "Run scan",
                  onAction: () => navigate("/app"),
                }}
                image="/images/Dashboard.png"
              >
                <p>{emptyMessage}</p>
              </EmptyState>
            ) : (
              <>
                <IndexTable
                  resourceName={{ singular: "issue", plural: "issues" }}
                  itemCount={rows.length}
                  selectedItemsCount={
                    allResourcesSelected ? "All" : selectedResources.length
                  }
                  onSelectionChange={handleSelectionChange}
                  headings={headings as [{ title: string }]}
                  loading={loading}
                  bulkActions={[
                    {
                      content: `${fixLabel} selected`,
                      onAction: fixSelected,
                    },
                  ]}
                >
                  {rows.map((row, index) => (
                    <IndexTable.Row
                      id={String(row.id)}
                      key={String(row.id)}
                      position={index}
                      selected={selectedResources.includes(String(row.id))}
                    >
                      <IndexTable.Cell>
                        <ResourceImage
                          src={
                            row.imageUrl ||
                            (typeof row.details?.imageUrl === "string"
                              ? row.details.imageUrl
                              : null) ||
                            (typeof row.details?.url === "string"
                              ? row.details.url
                              : null)
                          }
                          alt={row.productTitle || row.title}
                          onClick={() => setActive(row)}
                        />
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <BlockStack gap="100">
                          <Button
                            variant="plain"
                            onClick={() => setActive(row)}
                            textAlign="left"
                          >
                            {row.productTitle || row.title}
                          </Button>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {issueLabel(row.issueCode, row.title)}
                            {row.sku ? ` · SKU ${row.sku}` : ""}
                          </Text>
                        </BlockStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {issueLabel(row.issueCode)}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge tone={severityTone(row.severity)}>
                          {severityLabel(row.severity)}
                        </Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack gap="200">
                          <Button size="slim" onClick={() => setActive(row)}>
                            View
                          </Button>
                          <Button
                            size="slim"
                            variant="primary"
                            loading={bulk.state !== "idle"}
                            onClick={() => {
                              if (isNoMedia(row)) {
                                setActive(row);
                                return;
                              }
                              setActive(row);
                            }}
                          >
                            {isNoMedia(row) ? "Upload" : fixLabel}
                          </Button>
                        </InlineStack>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>

                {data && data.total > PAGE_SIZE && (
                  <InlineStack align="center" gap="300" blockAlign="center">
                    <Pagination
                      hasPrevious={page > 1}
                      onPrevious={() => setPage((p) => p - 1)}
                      hasNext={page * PAGE_SIZE < data.total}
                      onNext={() => setPage((p) => p + 1)}
                    />
                    <Text as="span" variant="bodySm" tone="subdued">
                      {(page - 1) * PAGE_SIZE + 1}–
                      {Math.min(page * PAGE_SIZE, data.total)} of {data.total}
                    </Text>
                  </InlineStack>
                )}
              </>
            )}
          </BlockStack>
        </Card>
      </BlockStack>

      <ResourceDetailModal
        row={active}
        module={module}
        shopDomain={shopDomain}
        field={field}
        fieldLabel={fieldLabel}
        open={Boolean(active)}
        onClose={() => setActive(null)}
        onFixed={load}
      />
    </Page>
  );
}
