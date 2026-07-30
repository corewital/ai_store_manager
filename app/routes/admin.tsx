import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { AppProvider } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { AdminLayout } from "../components/layout/AdminLayout";
import { getAdminUser } from "../services/admin/auth.server";
import adminStyles from "../styles/admin.css?url";
import standardTokens from "../styles/tokens/standard.css?url";

const PUBLIC_PATHS = ["/admin/login", "/admin/logout", "/admin/signup"];

export const meta: MetaFunction = () => [
  { title: "CorePilot AI Admin" },
];

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: standardTokens },
  { rel: "stylesheet", href: adminStyles },
  { rel: "icon", href: "/images/App_Favicon.png", type: "image/png" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const isPublic = PUBLIC_PATHS.some((p) => url.pathname.startsWith(p));
  const user = await getAdminUser(request);

  if (!user && !isPublic) {
    throw redirect("/admin/login");
  }

  return { user };
}

export default function AdminRouteLayout() {
  const { user } = useLoaderData<typeof loader>();

  if (!user) {
    return <Outlet />;
  }

  return (
    <AppProvider i18n={{}}>
      <AdminLayout user={user} />
    </AppProvider>
  );
}
