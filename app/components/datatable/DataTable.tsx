import { useCallback, useEffect, useState } from "react";
import {
  BlockStack,
  IndexTable,
  Pagination,
  Text,
  useIndexResourceState,
} from "@shopify/polaris";

import { Filters, type FilterState } from "./Filters";
import { ListGridToggle, type ViewMode } from "./ListGridToggle";

export type DatatableResponse = {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
  columns: { key: string; label: string; sortable?: boolean }[];
};

type Props = {
  table: string;
  /** Default admin API; merchant modules use `/api/app/datatable`. */
  endpoint?: string;
  pageSize?: number;
  initialData?: DatatableResponse;
  renderActions?: (
    row: Record<string, unknown>,
    helpers: { reload: () => void },
  ) => React.ReactNode;
  statusFilter?: boolean;
  defaultStatus?: string;
  statusOptions?: { label: string; value: string }[];
  showViewToggle?: boolean;
};

export function DataTable({
  table,
  endpoint = "/api/admin/datatable",
  pageSize = 20,
  initialData,
  renderActions,
  statusFilter,
  defaultStatus = "open",
  statusOptions,
  showViewToggle = true,
}: Props) {
  const [data, setData] = useState<DatatableResponse | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    status: defaultStatus,
  });
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<string | undefined>();
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [view, setView] = useState<ViewMode>("list");

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
      ...(sort ? { sort, order } : {}),
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    });
    const res = await fetch(`${endpoint}/${table}?${qs}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [table, endpoint, pageSize, page, sort, order, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = data?.rows ?? [];
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(rows.map((r) => ({ id: String(r.id) })));

  const headings = [
    ...(data?.columns ?? []).map((c) => ({ title: c.label })),
    ...(renderActions ? [{ title: "Actions" }] : []),
  ];

  if (view === "grid") {
    return (
      <BlockStack gap="300">
        <Filters
          filters={filters}
          onChange={setFilters}
          statusFilter={statusFilter}
          statusOptions={statusOptions}
        />
        {showViewToggle && <ListGridToggle view={view} onChange={setView} />}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: "0.75rem" }}>
          {rows.map((row) => (
            <div key={String(row.id)} style={{ border: "1px solid var(--color-border,#e2e8f0)", borderRadius: 8, padding: "0.75rem" }}>
              <Text as="p" variant="bodyMd" fontWeight="semibold">{String(row.subject ?? row.shopDomain ?? row.email ?? row.id)}</Text>
              <Text as="p" variant="bodySm" tone="subdued">{String(row.status ?? "")}</Text>
              {renderActions?.(row, { reload: load })}
            </div>
          ))}
        </div>
        {data && (
          <Pagination
            hasPrevious={page > 1}
            onPrevious={() => setPage((p) => p - 1)}
            hasNext={page * data.limit < data.total}
            onNext={() => setPage((p) => p + 1)}
          />
        )}
      </BlockStack>
    );
  }

  return (
    <BlockStack gap="300">
      <Filters
        filters={filters}
        onChange={(f) => {
          setFilters(f);
          setPage(1);
        }}
        statusFilter={statusFilter}
        statusOptions={statusOptions}
      />
      {showViewToggle && <ListGridToggle view={view} onChange={setView} />}
      <IndexTable
        resourceName={{ singular: "row", plural: "rows" }}
        itemCount={rows.length}
        selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
        onSelectionChange={handleSelectionChange}
        headings={headings as [{ title: string }]}
        loading={loading}
      >
        {rows.map((row, i) => (
          <IndexTable.Row id={String(row.id)} key={String(row.id)} position={i} selected={selectedResources.includes(String(row.id))}>
            {(data?.columns ?? []).map((c) => (
              <IndexTable.Cell key={c.key}>
                {c.sortable ? (
                  <button
                    type="button"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}
                    onClick={() => {
                      if (sort === c.key) setOrder((o) => (o === "asc" ? "desc" : "asc"));
                      else { setSort(c.key); setOrder("desc"); }
                    }}
                  >
                    {String(row[c.key] ?? "")}
                  </button>
                ) : (
                  String(row[c.key] ?? "")
                )}
              </IndexTable.Cell>
            ))}
            {renderActions && (
              <IndexTable.Cell>
                <div onClick={(e) => e.stopPropagation()}>
                  {renderActions(row, { reload: load })}
                </div>
              </IndexTable.Cell>
            )}
          </IndexTable.Row>
        ))}
      </IndexTable>
      {data && (
        <Pagination
          hasPrevious={page > 1}
          onPrevious={() => setPage((p) => p - 1)}
          hasNext={page * data.limit < data.total}
          onNext={() => setPage((p) => p + 1)}
        />
      )}
    </BlockStack>
  );
}
