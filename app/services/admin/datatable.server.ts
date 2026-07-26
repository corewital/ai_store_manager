import { and, asc, count, desc, eq, isNull, like, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  adminUsers,
  appInstalls,
  roles,
  shops,
  supportTickets,
  webhookLogs,
} from "../../db/schema";
import {
  DATATABLE_CONFIG,
  isWhitelistedTable,
  type WhitelistedTable,
} from "./datatable.config";

export type DatatableParams = {
  page?: number;
  limit?: number;
  sort?: string;
  order?: "asc" | "desc";
  search?: string;
  status?: string;
};

export type DatatableResult = {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
  columns: { key: string; label: string; sortable?: boolean }[];
};

function fmtDate(v: unknown) {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") return new Date(v).toISOString();
  return String(v);
}

async function queryAdminUsers(params: DatatableParams): Promise<DatatableResult> {
  const config = DATATABLE_CONFIG.adminUsers;
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const sort = config.columns.some((c) => c.key === params.sort) ? params.sort! : config.defaultSort;
  const order = params.order === "asc" ? asc : desc;
  const offset = (page - 1) * limit;

  const conditions = [isNull(adminUsers.deletedAt)];
  if (params.search) {
    const q = `%${params.search}%`;
    conditions.push(or(like(adminUsers.email, q), like(adminUsers.name, q))!);
  }
  if (params.status) conditions.push(eq(adminUsers.status, params.status));

  const orderCol =
    sort === "roleSlug" ? roles.slug : (adminUsers as unknown as Record<string, unknown>)[sort] as typeof adminUsers.id;

  const rows = await db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      name: adminUsers.name,
      roleSlug: roles.slug,
      status: adminUsers.status,
    })
    .from(adminUsers)
    .innerJoin(roles, eq(adminUsers.roleId, roles.id))
    .where(and(...conditions))
    .orderBy(order === asc ? asc(orderCol) : desc(orderCol))
    .limit(limit)
    .offset(offset);

  const [{ n }] = await db
    .select({ n: count() })
    .from(adminUsers)
    .where(and(...conditions));

  return { rows, total: n, page, limit, columns: config.columns };
}

async function queryAppInstalls(params: DatatableParams): Promise<DatatableResult> {
  const config = DATATABLE_CONFIG.appInstalls;
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const sort = config.columns.some((c) => c.key === params.sort) ? params.sort! : config.defaultSort;
  const orderFn = params.order === "asc" ? asc : desc;
  const offset = (page - 1) * limit;

  const conditions = [isNull(appInstalls.deletedAt)];
  if (params.search) {
    const q = `%${params.search}%`;
    conditions.push(or(like(appInstalls.shopDomain, q), like(appInstalls.notes, q))!);
  }
  if (params.status) conditions.push(eq(appInstalls.status, params.status));

  const orderCol = (appInstalls as unknown as Record<string, unknown>)[sort] as typeof appInstalls.id;

  const raw = await db
    .select({
      id: appInstalls.id,
      shopId: appInstalls.shopId,
      shopDomain: appInstalls.shopDomain,
      status: appInstalls.status,
      plan: shops.plan,
      accessToken: shops.accessToken,
      installedAt: shops.installedAt,
      uninstalledAt: shops.uninstalledAt,
      frozenAt: appInstalls.frozenAt,
      notes: appInstalls.notes,
      createdAt: appInstalls.createdAt,
      updatedAt: appInstalls.updatedAt,
    })
    .from(appInstalls)
    .leftJoin(shops, eq(appInstalls.shopId, shops.id))
    .where(and(...conditions))
    .orderBy(orderFn(orderCol))
    .limit(limit)
    .offset(offset);

  const rows = raw.map((r) => ({
    id: r.id,
    shopId: r.shopId,
    shopDomain: r.shopDomain,
    status: r.status,
    plan: r.plan ?? "free",
    tokenStatus: r.accessToken ? "Connected" : "Missing",
    createdAt: fmtDate(r.installedAt ?? r.createdAt),
    frozenAt: r.frozenAt ? fmtDate(r.frozenAt) : "",
    uninstalledAt: r.uninstalledAt ? fmtDate(r.uninstalledAt) : "",
    notes: r.notes,
    updatedAt: fmtDate(r.updatedAt),
  }));

  const [{ n }] = await db.select({ n: count() }).from(appInstalls).where(and(...conditions));

  return { rows, total: n, page, limit, columns: config.columns };
}

async function querySupportTickets(params: DatatableParams): Promise<DatatableResult> {
  const config = DATATABLE_CONFIG.supportTickets;
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const sort = config.columns.some((c) => c.key === params.sort) ? params.sort! : config.defaultSort;
  const orderFn = params.order === "asc" ? asc : desc;
  const offset = (page - 1) * limit;

  const conditions = [isNull(supportTickets.deletedAt)];
  if (params.search) {
    const q = `%${params.search}%`;
    conditions.push(or(like(supportTickets.subject, q), like(supportTickets.status, q))!);
  }
  if (params.status) conditions.push(eq(supportTickets.status, params.status));

  const orderCol =
    sort === "shopDomain"
      ? shops.shopDomain
      : ((supportTickets as unknown as Record<string, unknown>)[sort] as typeof supportTickets.id);

  const raw = await db
    .select({
      id: supportTickets.id,
      subject: supportTickets.subject,
      status: supportTickets.status,
      priority: supportTickets.priority,
      shopDomain: shops.shopDomain,
    })
    .from(supportTickets)
    .innerJoin(shops, eq(supportTickets.shopId, shops.id))
    .where(and(...conditions))
    .orderBy(orderFn(orderCol))
    .limit(limit)
    .offset(offset);

  const [{ n }] = await db
    .select({ n: count() })
    .from(supportTickets)
    .where(and(...conditions));

  return { rows: raw, total: n, page, limit, columns: config.columns };
}

async function queryWebhookLogs(params: DatatableParams): Promise<DatatableResult> {
  const config = DATATABLE_CONFIG.webhookLogs;
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const sort = config.columns.some((c) => c.key === params.sort) ? params.sort! : config.defaultSort;
  const orderFn = params.order === "asc" ? asc : desc;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (params.search) {
    const q = `%${params.search}%`;
    conditions.push(
      or(
        like(webhookLogs.topic, q),
        like(webhookLogs.shopDomain, q),
        like(webhookLogs.status, q),
      )!,
    );
  }
  if (params.status) conditions.push(eq(webhookLogs.status, params.status));

  const orderCol = (webhookLogs as unknown as Record<string, unknown>)[sort] as typeof webhookLogs.id;
  const where = conditions.length ? and(...conditions) : undefined;

  const raw = await db
    .select()
    .from(webhookLogs)
    .where(where)
    .orderBy(orderFn(orderCol))
    .limit(limit)
    .offset(offset);

  const rows = raw.map((r) => ({ ...r, createdAt: fmtDate(r.createdAt) }));

  const [{ n }] = await db
    .select({ n: count() })
    .from(webhookLogs)
    .where(where ?? sql`1=1`);

  return { rows, total: n, page, limit, columns: config.columns };
}

const QUERY_MAP: Record<WhitelistedTable, (p: DatatableParams) => Promise<DatatableResult>> = {
  adminUsers: queryAdminUsers,
  appInstalls: queryAppInstalls,
  supportTickets: querySupportTickets,
  webhookLogs: queryWebhookLogs,
};

export async function fetchDatatable(table: string, params: DatatableParams) {
  if (!isWhitelistedTable(table)) {
    throw new Response("Unknown table", { status: 404 });
  }
  return QUERY_MAP[table](params);
}

export function parseDatatableParams(url: URL): DatatableParams {
  return {
    page: Number(url.searchParams.get("page") || 1),
    limit: Number(url.searchParams.get("limit") || 20),
    sort: url.searchParams.get("sort") || undefined,
    order: (url.searchParams.get("order") as "asc" | "desc") || undefined,
    search: url.searchParams.get("search") || undefined,
    status: url.searchParams.get("status") || undefined,
  };
}
