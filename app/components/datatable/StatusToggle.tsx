import { Badge, Button, InlineStack } from "@shopify/polaris";

type Props = {
  active: boolean;
  label?: string;
  onToggle: () => void;
};

export function StatusToggle({ active, label = "item", onToggle }: Props) {
  return (
    <InlineStack gap="200" blockAlign="center">
      <Badge tone={active ? "success" : undefined}>{active ? "Active" : "Inactive"}</Badge>
      <Button size="slim" onClick={onToggle}>
        {active ? `Deactivate ${label}` : `Activate ${label}`}
      </Button>
    </InlineStack>
  );
}
