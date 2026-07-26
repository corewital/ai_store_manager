import { redirect } from "@remix-run/node";

/** Multi-store removed from merchant nav (Business feature parked). */
export const loader = () => redirect("/app");
