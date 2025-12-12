export type WidgetType =
    | 'cpu'
    | 'memory'
    | 'disk'

export interface StatsConfig {
    enabledWidgets: WidgetType[];
    statusCheckEnabled?: boolean;
    metricsEnabled?: boolean;
}

export const DEFAULT_STATS_CONFIG: StatsConfig = {
    enabledWidgets: ['cpu', 'memory', 'disk'],
    statusCheckEnabled: true,
    metricsEnabled: true,
};
