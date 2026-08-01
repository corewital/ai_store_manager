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
    setValue(row?.currentValue ?? "");
    setSaveField(field);
    setLocalPreview(null);
  }, [row?.id, row?.currentValue, field]);

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

  const link = adminUrl(shopDomain, row.resourceId);
  const format = imageFormat(row.imageUrl);
  const busy = fetcher.state !== "idle" || upload.state !== "idle";
  const noMedia = module === "products" && row.issueCode === "no_media";
  const altField = module === "images" && row.issueCode === "missing_alt";
  const label = issueLabel(row.issueCode, row.title);
  const productName = row.productTitle || row.title;
  const previewSrc = localPreview || (noMedia && value.startsWith("http") ? value : row.imageUrl);

  const submitManual = () => {
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
          content: noMedia ? "Save image to Shopify" : "Save to Shopify",
          onAction: submitManual,
          loading: busy && !fetcher.data?.preview,
          disabled: !value.trim() || busy,
        }}
        secondaryActions={[
          ...(noMedia
            ? []
            : [
                {
                  content: aiReady ? "Regenerate with AI" : "AI Fix (preview)",
                  onAction: submitAiPreview,
                  loading: busy,
                },
              ]),
          ...(link
            ? [{ content: "Open in Shopify", url: link, external: true }]
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
                to attach it in Shopify. AI cannot invent product photos.
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
              label={noMedia ? "Image URL (or upload above)" : fieldLabel}
              value={value}
              onChange={(v) => {
                setValue(altField ? v.slice(0, 125) : v);
                if (noMedia) setSaveField("imageUrl");
              }}
              autoComplete="off"
              multiline={noMedia ? 1 : 4}
              maxLength={altField ? 125 : undefined}
              showCharacterCount={altField}
              placeholder={
                noMedia ? "https://cdn.example.com/product.jpg" : undefined
              }
              helpText={
                noMedia
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
