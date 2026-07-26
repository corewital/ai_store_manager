import {
  adminUsers,
  appInstalls,
  roles,
  supportTickets,
  webhookLogs,
} from "../../db/schema";

export type DatatableColumn = {
  key: string;
  label: string;
  sortable?: boolean;
};

export type DatatableConfig = {
  columns: DatatableColumn[];
  defaultSort: string;
  defaultOrder: "asc" | "desc";
  searchColumns: string[];
};

export const DATATABLE_CONFIG: Record<string, DatatableConfig> = {
  adminUsers: {
    columns: [
      { key: "id", label: "ID", sortable: true },
      { key: "email", label: "Email", sortable: true },
      { key: "name", label: "Name", sortable: true },
      { key: "roleSlug", label: "Role", sortable: true },
      { key: "status", label: "Status", sortable: true },
    ],
    defaultSort: "id",
    defaultOrder: "desc",
    searchColumns: ["email", "name"],
  },
  appInstalls: {
    columns: [
      { key: "id", label: "ID", sortable: true },
      { key: "shopDomain", label: "Shop", sortable: true },
      { key: "status", label: "Status", sortable: true },
      { key: "plan", label: "Plan" },
      { key: "tokenStatus", label: "API token" },
      { key: "createdAt", label: "Installed", sortable: true },
      { key: "frozenAt", label: "Frozen", sortable: true },
      { key: "notes", label: "Notes" },
    ],
    defaultSort: "id",
    defaultOrder: "desc",
    searchColumns: ["shopDomain", "notes"],
  },
  supportTickets: {
    columns: [
      { key: "id", label: "ID", sortable: true },
      { key: "subject", label: "Subject", sortable: true },
      { key: "status", label: "Status", sortable: true },
      { key: "priority", label: "Priority", sortable: true },
      { key: "shopDomain", label: "Shop" },
    ],
    defaultSort: "id",
    defaultOrder: "desc",
    searchColumns: ["subject", "status"],
  },
  webhookLogs: {
    columns: [
      { key: "id", label: "ID", sortable: true },
      { key: "topic", label: "Topic", sortable: true },
      { key: "shopDomain", label: "Shop", sortable: true },
      { key: "status", label: "Status", sortable: true },
      { key: "createdAt", label: "Received", sortable: true },
    ],
    defaultSort: "id",
    defaultOrder: "desc",
    searchColumns: ["topic", "shopDomain", "status"],
  },
};

export type WhitelistedTable = keyof typeof DATATABLE_CONFIG;

export function isWhitelistedTable(table: string): table is WhitelistedTable {
  return table in DATATABLE_CONFIG;
}

/** Internal query handlers keyed by whitelist name. */
export const DATATABLE_HANDLERS = {
  adminUsers,
  appInstalls,
  supportTickets,
  webhookLogs,
  roles,
} as const;
