import { ScrollView, View } from "react-native";
import { Badge, type BadgeVariant } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { useConfirm } from "@/ui/Confirm";
import { Text } from "@/ui/Text";
import type { AiProposal } from "../types";
import { describeProposal, revealInvisible } from "./proposal";

export interface ProposalCardProps {
  proposal: AiProposal;
  hostName: (id: number) => string | undefined;
  onApply: (id: number) => void;
  onReject: (id: number) => void;
  busy?: boolean;
}

const STATUS_VARIANT: Record<AiProposal["status"], BadgeVariant> = {
  pending: "warning",
  applied: "success",
  failed: "destructive",
  rejected: "muted",
  expired: "muted",
};

export function ProposalCard({
  proposal,
  hostName,
  onApply,
  onReject,
  busy = false,
}: ProposalCardProps) {
  const confirm = useConfirm();
  const detail = describeProposal(proposal, hostName);
  const hosts = revealInvisible(detail.hosts.join(", "));
  const pending = proposal.status === "pending";
  const hasCommand = detail.command !== undefined;
  const emptyCommand = hasCommand && !detail.command?.trim();
  const content = emptyCommand
    ? "(empty command)"
    : revealInvisible(detail.command ?? detail.payload ?? "");
  const extraPayload =
    hasCommand && detail.payload ? revealInvisible(detail.payload) : undefined;
  const applyDisabled =
    busy ||
    detail.invalid ||
    emptyCommand ||
    (hasCommand && detail.hosts.length === 0);

  const apply = async () => {
    if (applyDisabled || !pending) return;
    const confirmed = await confirm({
      title: hasCommand
        ? `Run this command on ${hosts}?`
        : `Apply ${revealInvisible(detail.title)}?`,
      description: (
        <ScrollView testID="proposal-confirm-scroll" style={{ maxHeight: 240 }}>
          <Text selectable className="text-xs text-muted-foreground">
            {content}
          </Text>
          {extraPayload ? (
            <Text selectable className="text-xs text-muted-foreground">
              {extraPayload}
            </Text>
          ) : null}
        </ScrollView>
      ),
      confirmLabel: "Apply",
      destructive: detail.destructive,
    });
    if (confirmed) onApply(proposal.id);
  };

  return (
    <Card className="gap-3 p-3">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text weight="bold" className="text-sm">
          {revealInvisible(detail.title)}
        </Text>
        <Badge variant={STATUS_VARIANT[proposal.status]}>
          {proposal.status[0].toUpperCase() + proposal.status.slice(1)}
        </Badge>
      </View>
      {detail.summary ? (
        <Text selectable>{revealInvisible(detail.summary)}</Text>
      ) : null}
      <Text selectable className="text-xs text-muted-foreground">
        {hosts ? `Hosts: ${hosts}` : "Target hosts not specified"}
      </Text>
      {content ? (
        <View className="max-w-full border border-border bg-muted p-2">
          <Text selectable className="text-xs">
            {content}
          </Text>
        </View>
      ) : null}
      {extraPayload ? (
        <View className="max-w-full border border-border bg-muted p-2">
          <Text selectable className="text-xs">
            {extraPayload}
          </Text>
        </View>
      ) : null}
      {detail.explanation ? (
        <Text selectable className="text-xs text-muted-foreground">
          {revealInvisible(detail.explanation)}
        </Text>
      ) : null}
      {detail.reason ? (
        <Text selectable className="text-xs text-muted-foreground">
          {revealInvisible(detail.reason)}
        </Text>
      ) : null}
      {detail.invalid ? (
        <Text accessibilityRole="alert" className="text-xs text-destructive">
          Invalid proposal payload
        </Text>
      ) : null}
      {pending ? (
        <View className="flex-row gap-2">
          <Button
            className="flex-1"
            variant={detail.destructive ? "destructive" : "default"}
            disabled={applyDisabled}
            onPress={() => void apply()}
          >
            Apply
          </Button>
          <Button
            className="flex-1"
            variant="muted"
            disabled={busy}
            onPress={() => onReject(proposal.id)}
          >
            Reject
          </Button>
        </View>
      ) : proposal.resultSummary ? (
        <Text selectable className="text-xs text-muted-foreground">
          {revealInvisible(proposal.resultSummary)}
        </Text>
      ) : null}
    </Card>
  );
}
