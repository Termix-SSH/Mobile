import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import {
  CheckCircle,
  Loader2,
  AlertCircle,
  Clock,
  Circle,
  Play,
  Square,
  X,
  RotateCcw,
} from "lucide-react-native";
import type { TunnelCardProps } from "@/types";
import {
  BACKGROUNDS,
  BORDER_COLORS,
  RADIUS,
  TEXT_COLORS,
} from "@/app/constants/designTokens";

const TunnelCard: React.FC<TunnelCardProps> = ({
  tunnel,
  tunnelName,
  status,
  isLoading,
  onAction,
}) => {
  const getStatusInfo = () => {
    if (!status) {
      return {
        label: "Disconnected",
        color: "#6b7280",
        icon: Circle,
        bgColor: "rgba(107, 114, 128, 0.1)",
      };
    }

    const statusUpper = status.status?.toUpperCase() || "DISCONNECTED";

    switch (statusUpper) {
      case "CONNECTED":
        return {
          label: "Connected",
          color: "#10b981",
          icon: CheckCircle,
          bgColor: "rgba(16, 185, 129, 0.1)",
        };
      case "CONNECTING":
        return {
          label: "Connecting",
          color: "#3b82f6",
          icon: Loader2,
          bgColor: "rgba(59, 130, 246, 0.1)",
        };
      case "DISCONNECTING":
        return {
          label: "Disconnecting",
          color: "#f59e0b",
          icon: Loader2,
          bgColor: "rgba(245, 158, 11, 0.1)",
        };
      case "ERROR":
      case "FAILED":
        return {
          label: "Error",
          color: "#ef4444",
          icon: AlertCircle,
          bgColor: "rgba(239, 68, 68, 0.1)",
        };
      case "RETRYING":
        return {
          label: `Retrying (${status.retryCount || 0}/${status.maxRetries || 0})`,
          color: "#f59e0b",
          icon: RotateCcw,
          bgColor: "rgba(245, 158, 11, 0.1)",
        };
      case "WAITING":
        return {
          label: status.nextRetryIn
            ? `Waiting (${Math.ceil(status.nextRetryIn / 1000)}s)`
            : "Waiting",
          color: "#8b5cf6",
          icon: Clock,
          bgColor: "rgba(139, 92, 246, 0.1)",
        };
      default:
        return {
          label: statusUpper,
          color: "#6b7280",
          icon: Circle,
          bgColor: "rgba(107, 114, 128, 0.1)",
        };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  const statusValue = status?.status?.toUpperCase() || "DISCONNECTED";
  const canConnect =
    !status ||
    statusValue === "DISCONNECTED" ||
    statusValue === "ERROR" ||
    statusValue === "FAILED";
  const canDisconnect = statusValue === "CONNECTED";
  const canCancel =
    statusValue === "CONNECTING" ||
    statusValue === "RETRYING" ||
    statusValue === "WAITING";

  const portMapping = `${tunnel.sourcePort} → ${tunnel.endpointHost}:${tunnel.endpointPort}`;

  return (
    <View
      style={{
        backgroundColor: BACKGROUNDS.CARD,
        borderRadius: RADIUS.CARD,
        padding: 16,
        borderWidth: 1,
        borderColor: BORDER_COLORS.BUTTON,
        minHeight: 160,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text
            style={{
              color: TEXT_COLORS.PRIMARY,
              fontSize: 16,
              fontWeight: "600",
            }}
            numberOfLines={1}
          >
            Tunnel
          </Text>
        </View>
        <View
          style={{
            backgroundColor: statusInfo.bgColor,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 6,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          }}
        >
          <StatusIcon size={14} color={statusInfo.color} />
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: statusInfo.color,
            }}
          >
            {statusInfo.label}
          </Text>
        </View>
      </View>

      <View
        style={{
          backgroundColor: BACKGROUNDS.DARKER,
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            color: TEXT_COLORS.SECONDARY,
            fontSize: 12,
            marginBottom: 4,
          }}
        >
          Port Mapping
        </Text>
        <Text
          style={{
            color: TEXT_COLORS.PRIMARY,
            fontSize: 14,
            fontFamily: "monospace",
          }}
          numberOfLines={1}
        >
          {portMapping}
        </Text>
      </View>

      {(statusValue === "ERROR" || statusValue === "FAILED") &&
        status?.reason && (
          <View
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              borderWidth: 1,
              borderColor: "rgba(239, 68, 68, 0.3)",
              borderRadius: 8,
              padding: 8,
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: "#ef4444",
                fontSize: 12,
              }}
              numberOfLines={2}
            >
              {status.reason}
            </Text>
          </View>
        )}

      <View style={{ flexDirection: "row", gap: 8, marginTop: "auto" }}>
        {canConnect && (
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: isLoading ? "#374151" : "#22c55e",
              borderRadius: RADIUS.BUTTON,
              paddingVertical: 10,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              opacity: isLoading ? 0.6 : 1,
            }}
            onPress={() => onAction("connect")}
            disabled={isLoading}
            activeOpacity={0.7}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Play size={16} color="#ffffff" fill="#ffffff" />
                <Text
                  style={{
                    color: "#ffffff",
                    fontSize: 14,
                    fontWeight: "600",
                    marginLeft: 6,
                  }}
                >
                  Connect
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {canDisconnect && (
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: isLoading ? "#374151" : "#ef4444",
              borderRadius: RADIUS.BUTTON,
              paddingVertical: 10,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              opacity: isLoading ? 0.6 : 1,
            }}
            onPress={() => onAction("disconnect")}
            disabled={isLoading}
            activeOpacity={0.7}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Square size={16} color="#ffffff" />
                <Text
                  style={{
                    color: "#ffffff",
                    fontSize: 14,
                    fontWeight: "600",
                    marginLeft: 6,
                  }}
                >
                  Disconnect
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {canCancel && (
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: isLoading ? "#374151" : "#6b7280",
              borderRadius: RADIUS.BUTTON,
              paddingVertical: 10,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              opacity: isLoading ? 0.6 : 1,
            }}
            onPress={() => onAction("cancel")}
            disabled={isLoading}
            activeOpacity={0.7}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <X size={16} color="#ffffff" />
                <Text
                  style={{
                    color: "#ffffff",
                    fontSize: 14,
                    fontWeight: "600",
                    marginLeft: 6,
                  }}
                >
                  Cancel
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default TunnelCard;
