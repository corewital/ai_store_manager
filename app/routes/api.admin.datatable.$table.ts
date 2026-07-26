import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import { requireAdmin } from "../services/admin/auth.server";
import { fetchDatatable, parseDatatableParams } from "../services/admin/datatable.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const table = params.table!;
  const data = await fetchDatatable(table, parseDatatableParams(new URL(request.url)));
  return json(data);
}
