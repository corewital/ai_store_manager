import { redirect } from "@remix-run/node";

/** Folded into Settings → General. */
export const loader = () => redirect("/app/settings/general");
