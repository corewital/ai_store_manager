import type { LoaderFunctionArgs } from "@remix-run/node";

import { DataTable } from "../components/datatable/DataTable";
import { requireAdmin } from "../services/admin/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  return null;
}

export default function AdminWebhooksHealth() {
  return (
    <div className="admin-page">
      <p className="admin-page__lead">
        Recent inbound webhook deliveries — filter by status to find failures.
      </p>
      <div className="admin-card">
        <DataTable table="webhookLogs" statusFilter />
      </div>
    </div>
  );
}
