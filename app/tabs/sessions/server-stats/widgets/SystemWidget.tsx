import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Server } from 'lucide-react-native';
import { ServerMetrics } from '@/types';
import { BORDERS, BORDER_COLORS, RADIUS, BACKGROUNDS } from '@/app/constants/designTokens';

interface WidgetProps {
  metrics: ServerMetrics | null;
  isLoading?: boolean;
}

export const SystemWidget: React.FC<WidgetProps> = ({ metrics, isLoading }) => {
  // System info not yet in ServerMetrics type
  // Will show N/A until backend provides this data

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
        <Server size={20} color="#6366F1" />
        <Text style={styles.title}>System Info</Text>
      </View>

      <View style={styles.metricRow}>
        <Text style={[styles.value, { color: '#6366F1' }]}>N/A</Text>
        <Text style={styles.subtitle}>Not available yet</Text>
      </View>

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#6366F1" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  widgetCard: {
    padding: 16,
    position: 'relative',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  metricRow: {
    marginBottom: 12,
  },
  value: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
});
