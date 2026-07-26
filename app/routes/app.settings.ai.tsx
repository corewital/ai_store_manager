import { redirect } from "@remix-run/node";

/** AI config moved to Admin Core → System Settings. */
export const loader = () => redirect("/app/settings/general");
