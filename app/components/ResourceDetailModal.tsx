import { useEffect, useRef, useState } from "react";
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
  DropZone,
  Thumbnail,
} from "@shopify/polaris";

import { ResourceImage, imageFormat } from "./ResourceImage";
import { issueLabel, severityLabel } from "../lib/issue-labels";

export type IssueRow = {
  id: number | string;
  title: string;
  issueCode: string;
  severity?: string;
  status?: string;
  resourceId?: string | null;
  resourceType?: string | null;
  imageUrl?: string | null;
  productTitle?: string | null;
  sku?: string | null;
  currentValue?: string | null;
  productId?: string | null;
  details?: Record<string, unknown>;
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

function resolveEditField(
  module: string,
  issueCode: string,
  fallbackField: string,
  fallbackLabel: string,
): { field: string; label: string } {
  if (issueCode === "seo_title") {
    return { field: "seoTitle", label: "SEO meta title" };
  }
  if (issueCode === "seo_description") {
    return { field: "seoDescription", label: "SEO meta description" };
  }
  if (module === "collections" && issueCode === "missing_description") {
    return { field: "descriptionHtml", label: "Collection description (HTML)" };
  }
  if (module === "seo") {
    return { field: fallbackField || "seoTitle", label: fallbackLabel || "SEO title" };
  }
  return { field: fallbackField, label: fallbackLabel };
}

function initialValueForRow(
  row: IssueRow,
  editField: string,
): string {
  if (row.currentValue) return row.currentValue;
  const d = row.details || {};
  if (editField === "seoTitle") return String(d.seoTitle || "");
  if (editField === "seoDescription") return String(d.seoDescription || "");
  return "";
}

function adminUrl(
  shopDomain: string,
  gid?: string | null,
  productId?: string | null,
  resourceType?: string | null,
) {
  const store = shopDomain.replace(/\.myshopify\.com$/i, "").split(".")[0];
  if (!store) return null;

  const numeric = (raw: string) => {
    const parts = raw.split("/");
    return parts[parts.length - 1] || raw;
  };

  // Prefer product admin — MediaImage GIDs are not browsable alone
  if (productId) {
    return `https://admin.shopify.com/store/${store}/products/${numeric(productId)}`;
  }

  if (!gid) return null;
  const parts = gid.split("/");
  const type = parts[parts.length - 2] || resourceType || "";
  const id = parts[parts.length - 1];

  if (/ProductVariant/i.test(type)) {
    return `https://admin.shopify.com/store/${store}/products`;
  }
  if (/Product|MediaImage/i.test(type)) {
    return `https://admin.shopify.com/store/${store}/products/${id}`;
  }
  if (/Collection/i.test(type)) {
    return `https://admin.shopify.com/store/${store}/collections/${id}`;
  }
  return null;
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
    preview?: string;
    field?: string;
    url?: string;
  }>();
  const upload = useFetcher<{
    ok?: boolean;
    error?: string;
    url?: string;
    previewUrl?: string;
  }>();
  const [value, setValue] = useState("");
  const [saveField, setSaveField] = useState(field);
  const [lightbox, setLightbox] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!row) return;
    const resolved = resolveEditField(module, row.issueCode, field, fieldLabel);
    setValue(initialValueForRow(row, resolved.field));
    setSaveField(resolved.field);
    setLocalPreview(null);
  }, [row, field, fieldLabel, module]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.preview && fetcher.data.ok) {
      setValue(fetcher.data.preview);
      if (fetcher.data.field) setSaveField(fetcher.data.field);
      return;
    }
    if (fetcher.data.ok) {
      onFixed();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  useEffect(() => {
    if (upload.state === "idle" && upload.data?.ok && upload.data.url) {
      setValue(upload.data.url);
      setLocalPreview(upload.data.previewUrl || upload.data.url);
      setSaveField("imageUrl");
    }
  }, [upload.state, upload.data]);

  if (!row) return null;

  const editMeta = resolveEditField(module, row.issueCode, field, fieldLabel);
  const activeFieldLabel =
    saveField === "seoTitle"
      ? "SEO meta title"
      : saveField === "seoDescription"
        ? "SEO meta description"
        : editMeta.label;

  const link = row
    ? adminUrl(shopDomain, row.resourceId, row.productId, row.resourceType)
    : null;
  const openShopify = () => {
    if (!link) return;
    window.open(link, "_blank", "noopener,noreferrer");
  };
  const format = imageFormat(row.imageUrl);
  const busy = fetcher.state !== "idle" || upload.state !== "idle";
  const noMedia =
    (module === "products" || module === "collections") &&
    row.issueCode === "no_media";
  const altField = module === "images" && row.issueCode === "missing_alt";
  const reviewOnly =
    module === "inventory" ||
    module === "navigation" ||
    module === "theme" ||
    (module === "collections" && row.issueCode === "empty_collection");
  const label = issueLabel(row.issueCode, row.title);
  const productName = row.productTitle || row.title;
  const previewSrc = localPreview || (noMedia && value.startsWith("http") ? value : row.imageUrl);

  const submitManual = () => {
    if (reviewOnly) {
      fetcher.submit(
        {
          issueId: String(row.id),
          field: "note",
          manualValue: value.trim() || "reviewed",
        },
        { method: "post", action: `/api/fix/${module}` },
      );
      return;
    }
    const v = altField ? value.slice(0, 125) : value;
    fetcher.submit(
      {
        issueId: String(row.id),
        field: noMedia ? "imageUrl" : saveField || field,
        manualValue: v,
      },
      { method: "post", action: `/api/fix/${module}` },
    );
  };

  const submitAiPreview = () => {
    fetcher.submit(
      { issueId: String(row.id), intent: "preview" },
      { method: "post", action: `/api/fix/${module}` },
    );
  };

  const onFile = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setLocalPreview(URL.createObjectURL(file));
    upload.submit(fd, {
      method: "post",
      action: "/api/upload/product-image",
      encType: "multipart/form-data",
    });
  };

  const errText =
    fetcher.data?.skipMessage ||
    fetcher.data?.error ||
    upload.data?.error ||
    (fetcher.data && !fetcher.data.ok && !fetcher.data.preview
      ? "Something went wrong."
      : null);

  const showErr =
    errText && !/^\[object /.test(errText)
      ? errText
      : fetcher.data && !fetcher.data.ok && !fetcher.data.preview
        ? "Fix failed. Reopen the app from Shopify Admin if this continues."
        : null;

  const aiReady = Boolean(value.trim()) && fetcher.data?.preview;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={label}
        primaryAction={{
          content: reviewOnly
            ? "Mark reviewed"
            : noMedia
              ? "Save image to Shopify"
              : "Save to Shopify",
          onAction: submitManual,
          loading: busy && !fetcher.data?.preview,
          disabled: reviewOnly ? busy : !value.trim() || busy,
        }}
        secondaryActions={[
          ...(noMedia || reviewOnly
            ? []
            : [
                {
                  content: aiReady ? "Regenerate with AI" : "AI Fix (preview)",
                  onAction: submitAiPreview,
                  loading: busy,
                },
              ]),
          ...(link
            ? [
                {
                  content: "Open in Shopify",
                  onAction: openShopify,
                },
              ]
            : []),
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {showErr && <Banner tone="critical">{showErr}</Banner>}
            {aiReady && (
              <Banner tone="success">
                AI draft is in the field below. Review it, then click Save to Shopify.
              </Banner>
            )}
            {noMedia && (
              <Banner tone="info">
                Upload a file or paste a public https image URL. Preview first, then Save
                to attach it in Shopify. AI cannot invent photos.
              </Banner>
            )}
            {reviewOnly && (
              <Banner tone="info">
                {label} is a monitoring alert. Restock or adjust inventory in Shopify,
                then mark this issue reviewed here.
              </Banner>
            )}

            <InlineStack gap="300" blockAlign="start">
              {previewSrc && (
                <ResourceImage
                  src={previewSrc}
                  alt={productName}
                  size={72}
                  onClick={() => setLightbox(true)}
                />
              )}
              <BlockStack gap="150">
                <Text as="h3" variant="headingSm">
                  {productName}
                </Text>
                <InlineStack gap="200">
                  <Badge tone="info">{label}</Badge>
                  {row.severity && (
                    <Badge tone="warning">{severityLabel(row.severity)}</Badge>
                  )}
                  {format && <Badge>{format}</Badge>}
                </InlineStack>
                {row.sku && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    SKU: {row.sku}
                  </Text>
                )}
                {row.resourceId && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    {row.resourceId}
                  </Text>
                )}
              </BlockStack>
            </InlineStack>

            <Divider />

            {noMedia && (
              <BlockStack gap="300">
                <DropZone
                  accept="image/*"
                  type="image"
                  allowMultiple={false}
                  onDrop={(_drop, accepted) => onFile(accepted)}
                  variableHeight
                >
                  {localPreview ? (
                    <InlineStack gap="300" blockAlign="center">
                      <Thumbnail source={localPreview} alt="Preview" size="large" />
                      <Text as="p">Image ready — click Save to Shopify</Text>
                    </InlineStack>
                  ) : (
                    <DropZone.FileUpload actionHint="Accepts jpg, png, webp (max 8MB)" />
                  )}
                </DropZone>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFile([f]);
                  }}
                />
              </BlockStack>
            )}

            <TextField
              label={
                reviewOnly
                  ? "Optional note"
                  : noMedia
                    ? "Image URL (or upload above)"
                    : activeFieldLabel
              }
              value={value}
              onChange={(v) => {
                setValue(altField ? v.slice(0, 125) : v);
                if (noMedia) setSaveField("imageUrl");
              }}
              autoComplete="off"
              multiline={noMedia || reviewOnly ? 1 : 4}
              maxLength={altField ? 125 : undefined}
              showCharacterCount={altField}
              placeholder={
                noMedia
                  ? "https://cdn.example.com/product.jpg"
                  : reviewOnly
                    ? "Restocked in Shopify…"
                    : undefined
              }
              helpText={
                reviewOnly
                  ? "Click Mark reviewed after you handle this in Shopify Admin."
                  : noMedia
                    ? "Public https URL, or use file upload. Preview updates when you paste a URL."
                    : altField
                      ? "Alt text max 125 characters."
                      : "Click AI Fix to fill this field, edit if needed, then Save to Shopify."
              }
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      {lightbox && previewSrc && (
        <Modal open onClose={() => setLightbox(false)} title="Image preview">
          <Modal.Section>
            <BlockStack gap="300" inlineAlign="center">
              <img
                src={previewSrc}
                alt={productName}
                style={{
                  maxWidth: "100%",
                  maxHeight: "60vh",
                  objectFit: "contain",
                }}
              />
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </>
  );
}
