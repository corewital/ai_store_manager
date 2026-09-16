import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useEffect } from "react";

import { login } from "../../shopify.server";
import bodyHtml from "./landing-body.html?raw";

const SITE = "https://corepilotai.corewital.com";
const OG_IMAGE = `${SITE}/images/App_Store_Banner.png`;

export const meta: MetaFunction = () => [
  { title: "CorePilot AI — Store Health, Catalog Fixes & AI Assistant" },
  {
    name: "description",
    content:
      "Shopify embedded app: Health Score, product & SEO scans, one-click AI fixes, image optimization, and store-aware AI Assistant on Business+.",
  },
  { name: "keywords", content: "Shopify SEO app, store health score, AI assistant, catalog fix" },
  { tagName: "link", rel: "canonical", href: SITE },
  { property: "og:type", content: "website" },
  { property: "og:url", content: SITE },
  { property: "og:title", content: "CorePilot AI — Shopify Store Health & AI Assistant" },
  {
    property: "og:description",
    content:
      "Scan your catalog, fix SEO and images with AI, and chat with a store-aware assistant.",
  },
  { property: "og:image", content: OG_IMAGE },
  { name: "twitter:card", content: "summary_large_image" },
  { name: "twitter:image", content: OG_IMAGE },
];

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: "/landing/landing.css" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const chargeId =
    url.searchParams.get("charge_id") || url.searchParams.get("chargeId");
  const planHandle = url.searchParams.get("plan_handle");

  if (shop) {
    const qs = url.searchParams.toString();
    if (chargeId || planHandle) {
      throw redirect(`/app/settings/billing?${qs}`);
    }
    throw redirect(`/app?${qs}`);
  }

  return { showLogin: Boolean(login) };
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "CorePilot AI",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Shopify Admin, Web",
      offers: [
        { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
        {
          "@type": "Offer",
          name: "Starter",
          price: "4.99",
          priceCurrency: "USD",
        },
        {
          "@type": "Offer",
          name: "Professional",
          price: "9.99",
          priceCurrency: "USD",
        },
        {
          "@type": "Offer",
          name: "Business",
          price: "19.99",
          priceCurrency: "USD",
        },
        {
          "@type": "Offer",
          name: "Enterprise",
          price: "99.99",
          priceCurrency: "USD",
        },
      ],
      description:
        "Shopify app for catalog health scans, SEO and image fixes, and AI Assistant on Business plans.",
      url: SITE,
    },
    {
      "@type": "Organization",
      name: "CorePilot AI",
      url: SITE,
      logo: `${SITE}/images/Main_Brand_Logo_Horizontal.png`,
    },
  ],
};

function LandingScripts() {
  useEffect(() => {
    const tailwindSrc = "https://cdn.tailwindcss.com?plugins=forms,container-queries";
    if (!document.querySelector(`script[src="${tailwindSrc}"]`)) {
      const tw = document.createElement("script");
      tw.src = tailwindSrc;
      tw.onload = () => {
        const cfg = document.createElement("script");
        cfg.src = "/landing/tailwind-config.js";
        document.body.appendChild(cfg);
      };
      document.head.appendChild(tw);
    }

    const threeSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    if (!document.querySelector(`script[src="${threeSrc}"]`)) {
      const three = document.createElement("script");
      three.src = threeSrc;
      three.onload = () => {
        if (!document.querySelector('script[src="/landing/landing.js"]')) {
          const app = document.createElement("script");
          app.src = "/landing/landing.js";
          app.defer = true;
          document.body.appendChild(app);
        }
      };
      document.body.appendChild(three);
    }

    document.documentElement.classList.add("dark", "scroll-smooth");
    document.body.className =
      "bg-background font-body-md text-text-primary antialiased selection:bg-primary selection:text-background min-h-screen relative overflow-x-hidden";

    return () => {
      document.documentElement.classList.remove("dark", "scroll-smooth");
    };
  }, []);

  return null;
}

export default function Index() {
  useLoaderData<typeof loader>();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <LandingScripts />
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </>
  );
}
