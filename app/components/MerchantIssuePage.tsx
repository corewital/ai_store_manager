import { useFetcher } from "@remix-run/react";
import { Page, Card, Button, Banner, BlockStack } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { DataTable } from "./datatable/DataTable";

type Props = {
  title: string;
  table: string;
  fixLabel?: string;
  allowGrid?: boolean;
};

/** Shared merchant issue list: server-side DataTable + Fix action. */
export function MerchantIssuePage({
  title,
  table,
  fixLabel = "Fix",
  allowGrid = false,
}: Props) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();

  return (
    <Page>
      <TitleBar title={title} />
      <BlockStack gap="400">
        {fetcher.data && !fetcher.data.ok && (
          <Banner tone="critical">
            {fetcher.data.error === "fix_failed"
              ? "Fix failed. Try again."
              : "Could not apply fix."}
          </Banner>
        )}
        {fetcher.data?.ok && <Banner tone="success">Fixed.</Banner>}
        <Card>
          <DataTable
            table={table}
            endpoint="/api/app/datatable"
            statusFilter
            showViewToggle={allowGrid}
            renderActions={(row) => (
              <fetcher.Form method="post">
                <input type="hidden" name="issueId" value={String(row.id)} />
                <Button
                  submit
                  size="slim"
                  loading={fetcher.state !== "idle"}
                >
                  {fixLabel}
                </Button>
              </fetcher.Form>
            )}
          />
        </Card>
      </BlockStack>
    </Page>
  );
}
