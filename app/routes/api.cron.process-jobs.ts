import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { processQueuedShopJobs } from "../services/shopify/shop-jobs.server";

function assertCronAuth(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    throw new Response("Unauthorized", { status: 401 });
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  assertCronAuth(request);
  const results = await processQueuedShopJobs(25);
  return json({ ok: true, processed: results.length, results });
};

export const action = loader;
