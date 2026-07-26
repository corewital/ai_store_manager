import { redirect } from "@remix-run/node";

/** Merchant AI settings are managed in Admin Core → AI (providers). */
export const loader = () => redirect("/app/settings/general");
