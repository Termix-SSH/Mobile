import { ScrollView, View } from "react-native";
import { Badge, type BadgeVariant } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { useConfirm } from "@/ui/Confirm";
import { Text } from "@/ui/Text";
import type { AiProposal } from "../types";
import { describeProposal } from "./proposal";

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
  const hosts = detail.hosts.join(", ");
  const pending = proposal.status === "pending";

  const apply = async () => {
    if (busy || detail.invalid || !pending) return;
    const confirmed = await confirm({
      title: `Run this on ${hosts || "the target hosts"}?`,
      description: (
        <Text selectable className="text-xs text-muted-foreground">
          {detail.command ?? detail.summary}
        </Text>
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
          {detail.title}
        </Text>
        <Badge variant={STATUS_VARIANT[proposal.status]}>
          {proposal.status[0].toUpperCase() + proposal.status.slice(1)}
        </Badge>
      </View>
      {detail.summary ? <Text selectable>{detail.summary}</Text> : null}
      <Text selectable className="text-xs text-muted-foreground">
        {hosts ? `Hosts: ${hosts}` : "Target hosts not specified"}
      </Text>
      {detail.command !== undefined ? (
        <ScrollView
          horizontal
          className="max-w-full border border-border bg-muted"
          contentContainerStyle={{ padding: 8 }}
        >
          <Text selectable className="text-xs">
            {detail.command}
          </Text>
        </ScrollView>
      ) : null}
      {detail.explanation ? (
        <Text selectable className="text-xs text-muted-foreground">
          {detail.explanation}
        </Text>
      ) : null}
      {detail.reason ? (
        <Text selectable className="text-xs text-muted-foreground">
          {detail.reason}
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
            disabled={busy || detail.invalid}
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
          {proposal.resultSummary}
        </Text>
      ) : null}
    </Card>
  );
}
