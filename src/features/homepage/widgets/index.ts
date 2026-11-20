import type { ComponentType } from "react";
import {
  Bookmark,
  Calendar,
  Clock,
  CloudSun,
  Code,
  Globe,
  Image as ImageIcon,
  LayoutGrid,
  Link,
  ListTree,
  Radar,
  Rss,
  Search,
  Server,
  StickyNote,
  Timer,
  Type,
  Zap,
} from "lucide-react-native";
import type { FeatureIcon } from "@/core/features/types";
import {
  CustomApiWidget,
  ImageWidget,
  RssFeedWidget,
  WeatherWidget,
} from "./feeds";
import {
  BookmarkListWidget,
  LinkTreeWidget,
  SearchBarWidget,
  SearchLinksWidget,
  ServiceGridWidget,
  ServiceLinksWidget,
  ServiceLinkWidget,
} from "./links";
import type { WidgetProps } from "./shared";
import {
  HostGridWidget,
  HostStatusWidget,
  PingStatusWidget,
  QuickConnectWidget,
} from "./status";
import { NotesWidget, TextBannerWidget } from "./text";
import { CalendarWidget, ClockWidget, CountdownWidget } from "./time";
import { t } from "@/i18n";

interface WidgetType {
  label: string;
  icon: FeatureIcon;
  component?: ComponentType<WidgetProps>;
}

/** Widget types the app draws itself. The rest open in Homepage. */
export const WIDGETS: Record<string, WidgetType> = {
  service_grid: {
    label: t("homepage.widgets.services"),
    icon: LayoutGrid,
    component: ServiceGridWidget,
  },
  service_link: {
    label: t("homepage.widgets.service"),
    icon: Globe,
    component: ServiceLinkWidget,
  },
  dashboard_links: {
    label: t("homepage.widgets.serviceLinks"),
    icon: Link,
    component: ServiceLinksWidget,
  },
  service_links: {
    label: t("homepage.widgets.serviceLinks"),
    icon: Link,
    component: ServiceLinksWidget,
  },
  bookmark_list: {
    label: t("homepage.widgets.bookmarks"),
    icon: Bookmark,
    component: BookmarkListWidget,
  },
  link_tree: {
    label: t("homepage.widgets.links2"),
    icon: ListTree,
    component: LinkTreeWidget,
  },
  search_links: {
    label: t("homepage.widgets.search"),
    icon: Search,
    component: SearchLinksWidget,
  },
  search_bar: {
    label: t("homepage.widgets.search"),
    icon: Search,
    component: SearchBarWidget,
  },
  clock: {
    label: t("homepage.widgets.clock"),
    icon: Clock,
    component: ClockWidget,
  },
  countdown: {
    label: t("homepage.widgets.countdown"),
    icon: Timer,
    component: CountdownWidget,
  },
  calendar: {
    label: t("homepage.widgets.calendar"),
    icon: Calendar,
    component: CalendarWidget,
  },
  notes: {
    label: t("homepage.widgets.notes"),
    icon: StickyNote,
    component: NotesWidget,
  },
  markdown_notes: {
    label: t("homepage.widgets.notes"),
    icon: StickyNote,
    component: NotesWidget,
  },
  text_banner: {
    label: t("homepage.widgets.banner"),
    icon: Type,
    component: TextBannerWidget,
  },
  ping_status: {
    label: t("homepage.widgets.ping"),
    icon: Radar,
    component: PingStatusWidget,
  },
  host_status: {
    label: t("homepage.widgets.host"),
    icon: Server,
    component: HostStatusWidget,
  },
  host_grid: {
    label: t("homepage.widgets.hosts"),
    icon: Server,
    component: HostGridWidget,
  },
  quick_connect: {
    label: t("homepage.widgets.quickConnect"),
    icon: Zap,
    component: QuickConnectWidget,
  },
  ssh_quick_connect: {
    label: t("homepage.widgets.quickConnect"),
    icon: Zap,
    component: QuickConnectWidget,
  },
  rss_feed: {
    label: t("homepage.widgets.feed"),
    icon: Rss,
    component: RssFeedWidget,
  },
  weather: {
    label: t("homepage.widgets.weather"),
    icon: CloudSun,
    component: WeatherWidget,
  },
  custom_api: {
    label: t("homepage.widgets.customApi"),
    icon: Code,
    component: CustomApiWidget,
  },
  image_widget: {
    label: t("homepage.widgets.picture"),
    icon: ImageIcon,
    component: ImageWidget,
  },
};

/** Grid headings only; the phone lists cards without them. */
export const SKIPPED_TYPES = new Set(["folder"]);

export function widgetType(typeId: string): WidgetType {
  return (
    WIDGETS[typeId] ?? { label: t("homepage.widgets.widget"), icon: LayoutGrid }
  );
}
