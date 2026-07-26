import { InlineStack, Select, TextField } from "@shopify/polaris";

export type FilterState = { search: string; status: string };

type Props = {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  statusFilter?: boolean;
  statusOptions?: { label: string; value: string }[];
};

const DEFAULT_STATUS_OPTIONS = [
  { label: "Open", value: "open" },
  { label: "Resolved", value: "resolved" },
  { label: "All statuses", value: "" },
  { label: "Pending", value: "pending" },
  { label: "Error", value: "error" },
];

export function Filters({
  filters,
  onChange,
  statusFilter,
  statusOptions = DEFAULT_STATUS_OPTIONS,
}: Props) {
  return (
    <InlineStack gap="300" blockAlign="end">
      <div style={{ flex: 1, minWidth: 200 }}>
        <TextField
          label="Search"
          value={filters.search}
          onChange={(v) => onChange({ ...filters, search: v })}
          autoComplete="off"
          clearButton
          onClearButtonClick={() => onChange({ ...filters, search: "" })}
        />
      </div>
      {statusFilter && (
        <Select
          label="Status"
          options={statusOptions}
          value={filters.status}
          onChange={(v) => onChange({ ...filters, status: v })}
        />
      )}
    </InlineStack>
  );
}
