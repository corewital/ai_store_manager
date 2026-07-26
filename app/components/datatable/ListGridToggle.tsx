import { Button, InlineStack } from "@shopify/polaris";

export type ViewMode = "list" | "grid";

type Props = { view: ViewMode; onChange: (v: ViewMode) => void };

export function ListGridToggle({ view, onChange }: Props) {
  return (
    <InlineStack gap="100">
      <Button pressed={view === "list"} onClick={() => onChange("list")}>List</Button>
      <Button pressed={view === "grid"} onClick={() => onChange("grid")}>Grid</Button>
    </InlineStack>
  );
}
