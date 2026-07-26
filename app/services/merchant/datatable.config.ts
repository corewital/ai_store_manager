import {
  collectionIssues,
  fixQueue,
  imageIssues,
  inventoryFlags,
  navigationIssues,
  productIssues,
  reportsSent,
  seoIssues,
  teamMembers,
  themeIssues,
} from "../../db/schema";
import type { DatatableConfig } from "../admin/datatable.config";

export const MERCHANT_DATATABLE_CONFIG: Record<string, DatatableConfig> = {
  productIssues: {
    columns: [
      { key: "title", label: "Issue", sortable: true },
      { key: "issueCode", label: "Code", sortable: true },
      { key: "severity", label: "Severity", sortable: true },
      { key: "status", label: "Status", sortable: true },
    ],
    defaultSort: "id",
    defaultOrder: "desc",
    searchColumns: ["title", "issueCode"],
  },
  seoIssues: {
    columns: [
      { key: "title", label: "Issue", sortable: true },
      { key: "issueCode", label: "Code", sortable: true },
      { key: "severity", label: "Severity", sortable: true },
      { key: "status", label: "Status", sortable: true },
    ],
    defaultSort: "id",
    defaultOrder: "desc",
    searchColumns: ["title", "issueCode"],
  },
  imageIssues: {
    columns: [
      { key: "title", label: "Issue", sortable: true },
      { key: "issueCode", label: "Code", sortable: true },
      { key: "severity", label: "Severity", sortable: true },
      { key: "status", label: "Status", sortable: true },
    ],
    defaultSort: "id",
    defaultOrder: "desc",
    searchColumns: ["title", "issueCode"],
  },
  inventoryFlags: {
    columns: [
      { key: "title", label: "Issue", sortable: true },
      { key: "issueCode", label: "Code", sortable: true },
      { key: "severity", label: "Severity", sortable: true },
      { key: "status", label: "Status", sortable: true },
    ],
    defaultSort: "id",
    defaultOrder: "desc",
    searchColumns: ["title", "issueCode"],
  },
  collectionIssues: {
    columns: [
      { key: "title", label: "Issue", sortable: true },
      { key: "issueCode", label: "Code", sortable: true },
      { key: "severity", label: "Severity", sortable: true },
      { key: "status", label: "Status", sortable: true },
    ],
    defaultSort: "id",
    defaultOrder: "desc",
    searchColumns: ["title", "issueCode"],
  },
  navigationIssues: {
    columns: [
      { key: "title", label: "Issue", sortable: true },
      { key: "issueCode", label: "Code", sortable: true },
      { key: "severity", label: "Severity", sortable: true },
      { key: "status", label: "Status", sortable: true },
    ],
    defaultSort: "id",
    defaultOrder: "desc",
    searchColumns: ["title", "issueCode"],
  },
  themeIssues: {
    columns: [
      { key: "title", label: "Issue", sortable: true },
      { key: "issueCode", label: "Code", sortable: true },
      { key: "severity", label: "Severity", sortable: true },
      { key: "status", label: "Status", sortable: true },
    ],
    defaultSort: "id",
    defaultOrder: "desc",
    searchColumns: ["title", "issueCode"],
  },
  reportsSent: {
    columns: [
      { key: "type", label: "Type", sortable: true },
      { key: "subject", label: "Subject", sortable: true },
      { key: "summary", label: "Summary" },
      { key: "sentAt", label: "Sent", sortable: true },
    ],
    defaultSort: "id",
    defaultOrder: "desc",
    searchColumns: ["type", "subject"],
  },
  fixQueue: {
    columns: [
      { key: "module", label: "Module", sortable: true },
      { key: "action", label: "Action", sortable: true },
      { key: "issueId", label: "Issue", sortable: true },
      { key: "status", label: "Status", sortable: true },
      { key: "createdAt", label: "Queued", sortable: true },
    ],
    defaultSort: "id",
    defaultOrder: "desc",
    searchColumns: ["module", "action", "status"],
  },
  teamMembers: {
    columns: [
      { key: "email", label: "Email", sortable: true },
      { key: "role", label: "Role", sortable: true },
      { key: "status", label: "Status", sortable: true },
    ],
    defaultSort: "id",
    defaultOrder: "desc",
    searchColumns: ["email", "role"],
  },
};

export type MerchantTable = keyof typeof MERCHANT_DATATABLE_CONFIG;

export function isMerchantTable(table: string): table is MerchantTable {
  return table in MERCHANT_DATATABLE_CONFIG;
}

export const MERCHANT_TABLES = {
  productIssues,
  seoIssues,
  imageIssues,
  inventoryFlags,
  collectionIssues,
  navigationIssues,
  themeIssues,
  fixQueue,
  reportsSent,
  teamMembers,
} as const;
