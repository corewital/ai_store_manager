import { desc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { activityLogs, fixQueue, reportsSent } from "../../db/schema";
import { merchantSafeError } from "../../lib/errors.server";

export type ShopActivityItem = {
  id: string;
  kind: "fix" | "report" | "scan" | "other";
  title: string;
  detail: string | null;
  before: string | null;
  after: string | null;
  module: string | null;
  status: string | null;
  href: string;
  at: string | null;
};

function parseMeta(raw: string | null | undefined) {
  if (!raw) return {} as Record<string, unknown>;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Recent merchant-facing activity (fixes, reports, admin actions tagged with shop). */
export async function listShopActivity(
  shopId: number,
  shopDomain: string,
  limit = 20,
): Promise<ShopActivityItem[]> {
  const [fixes, reports, logs] = await Promise.all([
    db.query.fixQueue.findMany({
      where: eq(fixQueue.shopId, shopId),
      orderBy: [desc(fixQueue.updatedAt)],
      limit,
    }),
    db.query.reportsSent.findMany({
      where: eq(reportsSent.shopId, shopId),
      orderBy: [desc(reportsSent.sentAt)],
      limit: 10,
    }),
    db.query.activityLogs.findMany({
      orderBy: [desc(activityLogs.createdAt)],
      limit: 40,
    }),
  ]);

  const items: ShopActivityItem[] = [];

  for (const f of fixes) {
    const meta = parseMeta(f.payloadJson);
    items.push({
      id: `fix-${f.id}`,
      kind: "fix",
      title: `${f.status === "done" ? "Fixed" : f.status === "failed" ? "Fix failed" : "Fix queued"}: ${f.module}`,
      detail: f.errorMessage ? merchantSafeError(f.errorMessage) : f.action,
      before: typeof meta.before === "string" ? meta.before : null,
      after: typeof meta.after === "string" ? meta.after : null,
      module: f.module,
      status: f.status,
      href: "/app/fixes",
      at: f.updatedAt ? new Date(f.updatedAt).toISOString() : null,
    });
  }

  for (const r of reports) {
    items.push({
      id: `report-${r.id}`,
      kind: "report",
      title: `${r.type} report sent`,
      detail: r.subject,
      before: null,
      after: null,
      module: "reports",
      status: "sent",
      href: "/app/reports",
      at: r.sentAt ? new Date(r.sentAt).toISOString() : null,
    });
  }

  for (const log of logs) {
    const meta = parseMeta(log.metaJson);
    const domain = String(meta.shopDomain || "");
    const sid = Number(meta.shopId || 0);
    if (domain !== shopDomain && sid !== shopId) continue;
    items.push({
      id: `log-${log.id}`,
      kind: log.action.includes("scan") ? "scan" : "other",
      title: log.action.replace(/_/g, " "),
      detail:
        typeof meta.message === "string"
          ? meta.message
          : log.entityType
            ? `${log.entityType} #${log.entityId || ""}`
            : null,
      before: typeof meta.before === "string" ? meta.before : null,
      after: typeof meta.after === "string" ? meta.after : null,
      module: typeof meta.module === "string" ? meta.module : null,
      status: typeof meta.status === "string" ? meta.status : null,
      href: "/app/fixes",
      at: log.createdAt ? new Date(log.createdAt).toISOString() : null,
    });
  }

  return items
    .sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())
    .slice(0, limit);
}
