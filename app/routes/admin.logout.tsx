import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

import { logoutAdmin } from "../services/admin/auth.server";

export async function action({ request }: ActionFunctionArgs) {
  const cookie = await logoutAdmin(request);
  throw redirect("/admin/login", { headers: { "Set-Cookie": cookie } });
}

export async function loader() {
  throw redirect("/admin/login");
}
