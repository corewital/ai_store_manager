import { and, asc, count, desc, eq, isNull, like, or } from "drizzle-orm";

import { db } from "../../db/client";
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
import {
  MERCHANT_DATATABLE_CONFIG,
  isMerchantTable,
  type MerchantTable,
} from "./datatable.config";
import type {
  DatatableParams,
  DatatableResult,
} from "../admin/datatable.server";

type IssueSchema =
  | typeof productIssues
  | typeof seoIssues
  | typeof imageIssues
  | typeof inventoryFlags
  | typeof collectionIssues
  | typeof navigationIssues
  | typeof themeIssues;

const ISSUE_MAP: Record<string, IssueSchema> = {
  productIssues,
  seoIssues,
  imageIssues,
  inventoryFlags,
  collectionIssues,
  navigationIssues,
  themeIssues,
};

function fmtDate(v: unknown) {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

async function queryIssues(
  table: MerchantTable,
  shopId: number,
  params: DatatableParams,
): Promise<DatatableResult> {
  const schema = ISSUE_MAP[table];
  const config = MERCHANT_DATATABLE_CONFIG[table];
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const sort = config.columns.some((c) => c.key === params.sort)
    ? params.sort!
    : config.defaultSort;
  const orderFn = params.order === "asc" ? asc : desc;
  const offset = (page - 1) * limit;

  const conditions = [
    eq(schema.shopId, shopId),
    isNull(schema.deletedAt),
  ];
  const status = params.status || "open";
  if (status !== "all") {
    conditions.push(eq(schema.status, status));
  }
  if (params.search) {
    const q = `%${params.search}%`;
    conditions.push(or(like(schema.title, q), like(schema.issueCode, q))!);
  }

  const colMap = {
    id: schema.id,
    title: schema.title,
    issueCode: schema.issueCode,
    severity: schema.severity,
    status: schema.status,
  } as const;
  const orderCol = colMap[sort as keyof typeof colMap] ?? schema.id;

  const raw = await db
    .select({
      id: schema.id,
      title: schema.title,
      issueCode: schema.issueCode,
      severity: schema.severity,
      status: schema.status,
      resourceId: schema.resourceId,
      resourceType: schema.resourceType,
      detailsJson: schema.detailsJson,
    })
    .from(schema)
    .where(and(...conditions))
    .orderBy(orderFn(orderCol))
    .limit(limit)
    .offset(offset);

  const rows = raw.map((r) => {
    let details: Record<string, unknown> = {};
    try {
      details = r.detailsJson ? JSON.parse(r.detailsJson) : {};
    } catch {
      details = {};
    }
    return {
      id: r.id,
      title: r.title,
      issueCode: r.issueCode,
      severity: r.severity,
      status: r.status,
      resourceId: r.resourceId,
      resourceType: r.resourceType,
      imageUrl: (details.url as string) ?? (details.imageUrl as string) ?? null,
      currentValue:
        (details.currentValue as string) ?? (details.current as string) ?? null,
      details,
    };
  });

  const [{ n }] = await db
    .select({ n: count() })
    .from(schema)
    .where(and(...conditions));

  return { rows, total: n, page, limit, columns: config.columns };
}

async function queryFixQueue(
  shopId: number,
  params: DatatableParams,
): Promise<DatatableResult> {
  const config = MERCHANT_DATATABLE_CONFIG.fixQueue;
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const sort = config.columns.some((c) => c.key === params.sort)
    ? params.sort!
    : config.defaultSort;
  const orderFn = params.order === "asc" ? asc : desc;
  const offset = (page - 1) * limit;

  const conditions = [eq(fixQueue.shopId, shopId)];
  if (params.search) {
    const q = `%${params.search}%`;
    conditions.push(
      or(
        like(fixQueue.module, q),
        like(fixQueue.action, q),
        like(fixQueue.status, q),
      )!,
    );
  }
  if (params.status && params.status !== "all") {
    conditions.push(eq(fixQueue.status, params.status));
  }

  const colMap = {
    id: fixQueue.id,
    module: fixQueue.module,
    action: fixQueue.action,
    issueId: fixQueue.issueId,
    status: fixQueue.status,
    createdAt: fixQueue.createdAt,
  } as const;
  const orderCol = colMap[sort as keyof typeof colMap] ?? fixQueue.id;

  const raw = await db
    .select({
      id: fixQueue.id,
      module: fixQueue.module,
      action: fixQueue.action,
      issueId: fixQueue.issueId,
      status: fixQueue.status,
      createdAt: fixQueue.createdAt,
    })
    .from(fixQueue)
    .where(and(...conditions))
    .orderBy(orderFn(orderCol))
    .limit(limit)
    .offset(offset);

  const [{ n }] = await db
    .select({ n: count() })
    .from(fixQueue)
    .where(and(...conditions));

  return {
    rows: raw.map((r) => ({
      ...r,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : "",
    })),
    total: n,
    page,
    limit,
    columns: config.columns,
  };
}

async function queryReports(
  shopId: number,
  params: DatatableParams,
): Promise<DatatableResult> {
  const config = MERCHANT_DATATABLE_CONFIG.reportsSent;
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const sort = config.columns.some((c) => c.key === params.sort)
    ? params.sort!
    : config.defaultSort;
  const orderFn = params.order === "asc" ? asc : desc;
  const offset = (page - 1) * limit;

  const conditions = [eq(reportsSent.shopId, shopId)];
  if (params.search) {
    const q = `%${params.search}%`;
    conditions.push(
      or(like(reportsSent.type, q), like(reportsSent.subject, q))!,
    );
  }

  const colMap = {
    id: reportsSent.id,
    type: reportsSent.type,
    subject: reportsSent.subject,
    sentAt: reportsSent.sentAt,
  } as const;
  const orderCol = colMap[sort as keyof typeof colMap] ?? reportsSent.id;

  const raw = await db
    .select({
      id: reportsSent.id,
      type: reportsSent.type,
      subject: reportsSent.subject,
      summaryJson: reportsSent.summaryJson,
      sentAt: reportsSent.sentAt,
    })
    .from(reportsSent)
    .where(and(...conditions))
    .orderBy(orderFn(orderCol))
    .limit(limit)
    .offset(offset);

  const [{ n }] = await db
    .select({ n: count() })
    .from(reportsSent)
    .where(and(...conditions));

  return {
    rows: raw.map((r) => {
      let summary = "";
      try {
        const parsed = r.summaryJson ? JSON.parse(r.summaryJson) : null;
        summary =
          typeof parsed === "string"
            ? parsed
            : (parsed?.summary ??
              parsed?.recommendation ??
              JSON.stringify(parsed ?? ""));
      } catch {
        summary = r.summaryJson ?? "";
      }
      return {
        id: r.id,
        type: r.type,
        subject: r.subject,
        summary: String(summary).slice(0, 160),
        sentAt: fmtDate(r.sentAt),
      };
    }),
    total: n,
    page,
    limit,
    columns: config.columns,
  };
}

async function queryTeam(
  shopId: number,
  params: DatatableParams,
): Promise<DatatableResult> {
  const config = MERCHANT_DATATABLE_CONFIG.teamMembers;
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const sort = config.columns.some((c) => c.key === params.sort)
    ? params.sort!
    : config.defaultSort;
  const orderFn = params.order === "asc" ? asc : desc;
  const offset = (page - 1) * limit;

  const conditions = [
    eq(teamMembers.shopId, shopId),
    isNull(teamMembers.deletedAt),
  ];
  if (params.search) {
    const q = `%${params.search}%`;
    conditions.push(
      or(like(teamMembers.email, q), like(teamMembers.role, q))!,
    );
  }

  const colMap = {
    id: teamMembers.id,
    email: teamMembers.email,
    role: teamMembers.role,
  } as const;
  const orderCol = colMap[sort as keyof typeof colMap] ?? teamMembers.id;

  const raw = await db
    .select({
      id: teamMembers.id,
      email: teamMembers.email,
      role: teamMembers.role,
      acceptedAt: teamMembers.acceptedAt,
    })
    .from(teamMembers)
    .where(and(...conditions))
    .orderBy(orderFn(orderCol))
    .limit(limit)
    .offset(offset);

  const [{ n }] = await db
    .select({ n: count() })
    .from(teamMembers)
    .where(and(...conditions));

  return {
    rows: raw.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      status: r.acceptedAt ? "Active" : "Invited",
    })),
    total: n,
    page,
    limit,
    columns: config.columns,
  };
}

export async function fetchMerchantDatatable(
  table: string,
  shopId: number,
  params: DatatableParams,
): Promise<DatatableResult> {
  if (!isMerchantTable(table)) {
    throw new Response("Unknown table", { status: 404 });
  }
  if (table in ISSUE_MAP) return queryIssues(table, shopId, params);
  if (table === "fixQueue") return queryFixQueue(shopId, params);
  if (table === "reportsSent") return queryReports(shopId, params);
  if (table === "teamMembers") return queryTeam(shopId, params);
  throw new Response("Unknown table", { status: 404 });
}
