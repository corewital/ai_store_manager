import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "@remix-run/react";

export const meta: MetaFunction = () => [
  { title: "CorePilot AI" },
  { name: "description", content: "Shopify store health & optimization" },
];

export const links: LinksFunction = () => [
  { rel: "icon", href: "/images/App_Favicon.png", type: "image/png" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const path = new URL(request.url).pathname;
  const isMarketing =
    path === "/" ||
    path === "/features" ||
    path.startsWith("/features/") ||
    path === "/privacy" ||
    path.startsWith("/privacy/");
  return json({ isMarketing });
};

/** Inline Tailwind theme — must run immediately after the CDN script. */
const TAILWIND_CONFIG = `
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#10b981",
        "mint-accent": "#34d399",
        "mint-light": "#6ee7b7",
        "text-primary": "#f8fafc",
        "text-muted": "#94a3b8",
        background: "#040706",
        "surface-obsidian": "#080d0b",
        "surface-elevated": "#0d1411",
        "surface-container": "#121a16",
        "surface-container-high": "#18231e",
        "surface-border": "rgba(16, 185, 129, 0.15)",
        "surface-border-active": "rgba(16, 185, 129, 0.45)",
        "brand-deep": "#052219",
        "shopify-green": "#008060"
      },
      fontFamily: {
        "display-hero": ["Outfit", "sans-serif"],
        "title-md": ["Outfit", "sans-serif"],
        "body-md": ["Hanken Grotesk", "sans-serif"],
        "body-sm": ["Hanken Grotesk", "sans-serif"],
        "label-mono": ["JetBrains Mono", "monospace"]
      }
    }
  }
};
`;

const MARKETING_CRITICAL_CSS = `
html.cp-marketing, html.cp-marketing body {
  background: #040706 !important;
  color: #f8fafc;
  margin: 0;
}
/* Hide marketing markup until Tailwind CDN has applied utilities (prevents FOUC) */
html.cp-marketing:not(.cp-ready) .cp-marketing-root {
  opacity: 0;
}
html.cp-marketing.cp-ready .cp-marketing-root {
  opacity: 1;
  transition: opacity 0.15s ease;
}
`;

export default function App() {
  const { isMarketing } = useLoaderData<typeof loader>();

  return (
    <html
      lang="en"
      className={isMarketing ? "dark scroll-smooth cp-marketing" : undefined}
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {!isMarketing && (
          <link
            rel="stylesheet"
            href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
          />
        )}
        {isMarketing && (
          <>
            <style dangerouslySetInnerHTML={{ __html: MARKETING_CRITICAL_CSS }} />
            <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries" />
            <script dangerouslySetInnerHTML={{ __html: TAILWIND_CONFIG }} />
          </>
        )}
        <Meta />
        <Links />
      </head>
      <body
        className={
          isMarketing
            ? "bg-background font-body-md text-text-primary antialiased selection:bg-primary selection:text-background min-h-screen relative overflow-x-hidden"
            : undefined
        }
      >
        {isMarketing ? (
          <div className="cp-marketing-root">
            <Outlet />
          </div>
        ) : (
          <Outlet />
        )}
        {isMarketing && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
(function () {
  function ready() {
    document.documentElement.classList.add('cp-ready');
  }
  // Wait one frame so Tailwind CDN MutationObserver can style the body first
  if (window.requestAnimationFrame) {
    requestAnimationFrame(function () { requestAnimationFrame(ready); });
  } else {
    setTimeout(ready, 0);
  }
})();`,
            }}
          />
        )}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
