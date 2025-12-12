import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { Cpu } from "lucide-react-native";
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

export const CpuWidget: React.FC<WidgetProps> = ({ metrics, isLoading }) => {
  const cpuPercent = metrics?.cpu?.percent ?? null;
  const cores = metrics?.cpu?.cores ?? null;
  const load = metrics?.cpu?.load ?? null;

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
        <Cpu size={20} color="#60A5FA" />
        <Text style={styles.title}>CPU Usage</Text>
      </View>

      <View style={styles.metricRow}>
        <Text style={[styles.value, { color: "#60A5FA" }]}>
          {cpuPercent !== null ? `${cpuPercent.toFixed(1)}%` : "N/A"}
        </Text>
        <Text style={styles.subtitle}>
          {cores !== null ? `${cores} cores` : "N/A"}
        </Text>
      </View>

      {load && (
        <View style={styles.loadRow}>
          <View style={styles.loadItem}>
            <Text style={styles.loadValue}>{load[0].toFixed(2)}</Text>
            <Text style={styles.loadLabel}>1m</Text>
          </View>
          <View style={styles.loadItem}>
            <Text style={styles.loadValue}>{load[1].toFixed(2)}</Text>
            <Text style={styles.loadLabel}>5m</Text>
          </View>
          <View style={styles.loadItem}>
            <Text style={styles.loadValue}>{load[2].toFixed(2)}</Text>
            <Text style={styles.loadLabel}>15m</Text>
          </View>
        </View>
      )}

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#60A5FA" />
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
  loadRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 8,
  },
  loadItem: {
    alignItems: "center",
  },
  loadValue: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  loadLabel: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 2,
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
