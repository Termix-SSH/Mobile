export type WidgetType =
    | 'cpu'
    | 'memory'
    | 'disk'
    | 'network'
    | 'uptime'
    | 'processes'
    | 'system'
    | 'login_stats';

export interface StatsConfig {
    enabledWidgets: WidgetType[];
    statusCheckEnabled?: boolean;
    metricsEnabled?: boolean;
}

export const DEFAULT_STATS_CONFIG: StatsConfig = {
    enabledWidgets: ['cpu', 'memory', 'disk', 'uptime'],
    statusCheckEnabled: true,
    metricsEnabled: true,
};
