import type { ActionFunctionArgs, LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  EmptyState,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { desc, eq } from "drizzle-orm";
import { authenticate } from "../shopify.server";
import { db } from "../db/client";
import { performanceSnapshots } from "../db/schema";
import { ensureShop } from "../services/shopify/shops.server";
import {
  scanPerformance,
  type PerformanceMetrics,
} from "../services/scanners/performance-scanner.server";
import { ScoreGauge } from "../components/ScoreGauge";
import { healthNavFor, SubNav } from "../components/SubNav";
import { requireAppModule } from "../services/shopify/require-module.server";
import perfCss from "../styles/performance.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: perfCss }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  const modules = await requireAppModule("performance", shop.id);

  let metrics: PerformanceMetrics | null = null;
  let suggestions: string[] = [];
  let scannedAt: string | null = null;

  try {
    const snap = await db.query.performanceSnapshots.findFirst({
      where: eq(performanceSnapshots.shopId, shop.id),
      orderBy: [desc(performanceSnapshots.scannedAt)],
    });
    if (snap?.metricsJson) {
      const parsed = JSON.parse(snap.metricsJson);
      if (Array.isArray(parsed?.pages)) metrics = parsed as PerformanceMetrics;
    }
    if (snap?.suggestionsJson) {
      const parsed = JSON.parse(snap.suggestionsJson);
      suggestions = Array.isArray(parsed) ? parsed : [];
    }
    scannedAt = snap?.scannedAt ? new Date(snap.scannedAt).toISOString() : null;
  } catch {
    metrics = null;
  }

  return { metrics, suggestions, scannedAt, modules };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop, session.accessToken);
  try {
    const metrics = await scanPerformance(shop.id, admin);
    return { ok: true, score: metrics?.speedScore ?? 0 };
  } catch {
    return { ok: false };
  }
};

function toneLabel(score: number) {
  if (score >= 80) return { label: "Fast", cls: "is-good" };
  if (score >= 50) return { label: "Medium", cls: "is-mid" };
  return { label: "Slow", cls: "is-bad" };
}

export default function PerformancePage() {
  const { metrics, suggestions, scannedAt, modules } =
    useLoaderData<typeof loader>();
  const scan = useFetcher<typeof action>();
  const tone = metrics ? toneLabel(metrics.speedScore) : null;

  return (
    <Page fullWidth>
      <TitleBar title="Store Performance" />
      <SubNav items={healthNavFor(modules)} />
      <BlockStack gap="400">
        {scan.data && !scan.data.ok && (
          <Banner tone="critical">Scan failed. Try again.</Banner>
        )}

        {!metrics ? (
          <EmptyState
            heading="No performance data yet"
            action={{
              content: scan.state !== "idle" ? "Scanning…" : "Run scan",
              onAction: () => scan.submit({}, { method: "post" }),
              loading: scan.state !== "idle",
            }}
            image="/images/Performance.png"
          >
            <p>
              We measure homepage, collection, and product page weight to estimate
              storefront speed.
            </p>
          </EmptyState>
        ) : (
          <>
            <div className="cp-perf-hero">
              <div className="cp-perf-hero__glow" aria-hidden />
              <div className="cp-perf-hero__score">
                <ScoreGauge value={metrics.speedScore} size={140} />
                {tone && (
                  <span className={`cp-perf-badge ${tone.cls}`}>{tone.label}</span>
                )}
              </div>
              <div className="cp-perf-hero__copy">
                <Text as="h2" variant="headingXl">
                  Speed score {metrics.speedScore}
                </Text>
                <Text as="p" tone="subdued">
                  Estimated from storefront HTML, images, JS, CSS, and fonts.
                  {scannedAt
                    ? ` Last scan ${new Date(scannedAt).toLocaleString()}.`
                    : ""}
                </Text>
                <scan.Form method="post">
                  <Button submit variant="primary" loading={scan.state !== "idle"}>
                    Rescan performance
                  </Button>
                </scan.Form>
              </div>
            </div>

            <div className="cp-perf-grid">
              {metrics.pages.map((p) => {
                const t = toneLabel(p.speedScore);
                return (
                  <div key={p.url} className={`cp-perf-card ${t.cls}`}>
                    <div className="cp-perf-card__top">
                      <Text as="h3" variant="headingMd">
                        {p.pageType}
                      </Text>
                      <Badge>{`${p.speedScore}/100`}</Badge>
                    </div>
                    <div className="cp-perf-ring">
                      <span style={{ width: `${p.speedScore}%` }} />
                    </div>
                    <p className="cp-perf-meta">
                      {p.totalKb} KB · {p.requestCount} requests
                    </p>
                    <ul className="cp-perf-breakdown">
                      <li>Images {p.imageKb} KB</li>
                      <li>JS {p.jsKb} KB</li>
                      <li>CSS {p.cssKb} KB</li>
                      <li>Fonts {p.fontKb} KB</li>
                      <li>{p.thirdPartyCount} third-party</li>
                    </ul>
                  </div>
                );
              })}
            </div>

            <div className="cp-perf-panel">
              <Text as="h2" variant="headingMd">
                Largest assets
              </Text>
              <div className="cp-perf-assets">
                {metrics.largestAssets.slice(0, 12).map((a) => (
                  <a
                    key={a.url}
                    className="cp-perf-asset"
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="cp-perf-asset__name">
                      {a.url.split("/").pop()}
                    </span>
                    <Badge>{a.type}</Badge>
                    <span className="cp-perf-asset__size">{a.sizeKb} KB</span>
                  </a>
                ))}
              </div>
            </div>

            {suggestions.length > 0 && (
              <div className="cp-perf-panel">
                <Text as="h2" variant="headingMd">
                  Suggestions
                </Text>
                <BlockStack gap="300">
                  {suggestions.map((s) => (
                    <InlineStack
                      key={s}
                      align="space-between"
                      blockAlign="center"
                      gap="300"
                      wrap
                    >
                      <Text as="span">{s}</Text>
                      {s.toLowerCase().includes("image") && (
                        <Link to="/app/images">
                          <Button size="slim">Fix images</Button>
                        </Link>
                      )}
                    </InlineStack>
                  ))}
                </BlockStack>
              </div>
            )}
          </>
        )}
      </BlockStack>
    </Page>
  );
}
