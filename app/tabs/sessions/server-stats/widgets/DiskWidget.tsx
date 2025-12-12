import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { HardDrive } from "lucide-react-native";
import { ServerMetrics } from "@/types";
import {
  BORDERS,
  BORDER_COLORS,
  RADIUS,
  BACKGROUNDS,
} from "@/app/constants/designTokens";

interface WidgetProps {
  metrics: ServerMetrics | null;
  isLoading?: boolean;
}

export const DiskWidget: React.FC<WidgetProps> = ({ metrics, isLoading }) => {
  const diskPercent = metrics?.disk?.percent ?? null;
  const usedHuman = metrics?.disk?.usedHuman ?? null;
  const totalHuman = metrics?.disk?.totalHuman ?? null;

  return (
    <View
      style={[
        styles.widgetCard,
        {
          backgroundColor: BACKGROUNDS.DARKER,
          borderWidth: BORDERS.STANDARD,
          borderColor: BORDER_COLORS.PANEL,
          borderRadius: RADIUS.LARGE,
        },
      ]}
    >
      <View style={styles.header}>
        <HardDrive size={20} color="#F59E0B" />
        <Text style={styles.title}>Disk Usage</Text>
      </View>

      <View style={styles.metricRow}>
        <Text style={[styles.value, { color: "#F59E0B" }]}>
          {diskPercent !== null ? `${diskPercent.toFixed(1)}%` : "N/A"}
        </Text>
        <Text style={styles.subtitle}>
          {usedHuman !== null && totalHuman !== null
            ? `${usedHuman} / ${totalHuman}`
            : "N/A"}
        </Text>
      </View>

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#F59E0B" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  widgetCard: {
    padding: 16,
    position: "relative",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  metricRow: {
    marginBottom: 12,
  },
  value: {
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
  },
});
