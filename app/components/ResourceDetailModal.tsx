import { useEffect, useState } from "react";
import { useFetcher } from "@remix-run/react";
import {
  Modal,
  TextField,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  Banner,
  Divider,
} from "@shopify/polaris";

import { ResourceImage, imageFormat } from "./ResourceImage";

export type IssueRow = {
  id: number | string;
  title: string;
  issueCode: string;
  severity?: string;
  status?: string;
  resourceId?: string | null;
  resourceType?: string | null;
  imageUrl?: string | null;
  currentValue?: string | null;
};

type Props = {
  row: IssueRow | null;
  module: string;
  shopDomain: string;
  field: string;
  fieldLabel: string;
  open: boolean;
  onClose: () => void;
  onFixed: () => void;
};

function adminUrl(shopDomain: string, gid?: string | null) {
  if (!gid) return null;
  const store = shopDomain.replace(".myshopify.com", "");
  const [, , type, id] = gid.split("/");
  const path =
    type === "Product"
      ? "products"
      : type === "Collection"
        ? "collections"
        : null;
  if (!path) return null;
  return `https://admin.shopify.com/store/${store}/${path}/${id}`;
}

export function ResourceDetailModal({
  row,
  module,
  shopDomain,
  field,
  fieldLabel,
  open,
  onClose,
  onFixed,
}: Props) {
  const fetcher = useFetcher<{
    ok?: boolean;
    error?: string;
    skipMessage?: string;
  }>();
  const [value, setValue] = useState("");
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    setValue(row?.currentValue ?? "");
  }, [row?.id, row?.currentValue]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      onFixed();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  if (!row) return null;

  const link = adminUrl(shopDomain, row.resourceId);
  const format = imageFormat(row.imageUrl);
  const busy = fetcher.state !== "idle";
  const noMedia = module === "products" && row.issueCode === "no_media";
  const altField = module === "images" && row.issueCode === "missing_alt";

  const submitManual = () => {
    const v = altField ? value.slice(0, 125) : value;
    fetcher.submit(
      {
        issueId: String(row.id),
        field: noMedia ? "imageUrl" : field,
        manualValue: v,
      },
      { method: "post", action: `/api/fix/${module}` },
    );
  };

  const submitAi = () => {
    fetcher.submit(
      { issueId: String(row.id) },
      { method: "post", action: `/api/fix/${module}` },
    );
  };

  const errText =
    fetcher.data?.skipMessage ||
    fetcher.data?.error ||
    (fetcher.data && !fetcher.data.ok
      ? "Something went wrong applying this fix."
      : null);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={row.title}
        primaryAction={
          noMedia
            ? {
                content: "Upload from URL",
                onAction: submitManual,
                loading: busy,
                disabled: !value.trim(),
              }
            : {
                content: "Save manual fix",
                onAction: submitManual,
                loading: busy,
                disabled: !value.trim(),
              }
        }
        secondaryActions={[
          ...(noMedia
            ? link
              ? [
                  {
                    content: "Open product in Shopify",
                    url: link,
                    external: true,
                  },
                ]
              : []
            : [
                {
                  content:
                    module === "images" && row.issueCode === "oversized"
                      ? "Optimize image"
                      : "AI Fix",
                  onAction: submitAi,
                  loading: busy,
                },
                ...(link
                  ? [
                      {
                        content: "Open in Shopify",
                        url: link,
                        external: true,
                      },
                    ]
                  : []),
              ]),
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {errText && <Banner tone="critical">{errText}</Banner>}

            {noMedia && (
              <Banner tone="info">
                Paste a public image URL (https://…). We attach it to the product
                in Shopify. AI cannot invent product photos.
              </Banner>
            )}

            <InlineStack gap="300" blockAlign="center">
              {row.imageUrl && (
                <ResourceImage
                  src={row.imageUrl}
                  alt={row.title}
                  size={72}
                  onClick={() => setLightbox(true)}
                />
              )}
              <BlockStack gap="150">
                <InlineStack gap="200">
                  <Badge>{row.issueCode}</Badge>
                  {row.severity && <Badge tone="warning">{row.severity}</Badge>}
                  {format && <Badge tone="info">{format}</Badge>}
                </InlineStack>
                {row.resourceId && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    {row.resourceId}
                  </Text>
                )}
              </BlockStack>
            </InlineStack>

            <Divider />
            <TextField
              label={noMedia ? "Image URL" : fieldLabel}
              value={value}
              onChange={(v) => setValue(altField ? v.slice(0, 125) : v)}
              autoComplete="off"
              multiline={noMedia ? 1 : 3}
              maxLength={altField ? 125 : undefined}
              showCharacterCount={altField}
              placeholder={
                noMedia ? "https://cdn.example.com/product.jpg" : undefined
              }
              helpText={
                noMedia
                  ? "Must be a publicly reachable https image URL."
                  : altField
                    ? "Alt text max 125 characters (SEO)."
                    : "Type your own value, or use AI Fix to generate one."
              }
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {lightbox && row.imageUrl && (
        <Modal open onClose={() => setLightbox(false)} title="Image preview">
          <Modal.Section>
            <BlockStack gap="300" inlineAlign="center">
              <img
                src={row.imageUrl}
                alt={row.title}
                style={{
                  maxWidth: "100%",
                  maxHeight: "60vh",
                  objectFit: "contain",
                }}
              />
              <InlineStack gap="200">
                {format && <Badge tone="info">{format}</Badge>}
                <Button url={row.imageUrl} target="_blank" size="slim">
                  Open original
                </Button>
              </InlineStack>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </>
  );
}
