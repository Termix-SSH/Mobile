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

interface WidgetType {
  label: string;
  icon: FeatureIcon;
  component?: ComponentType<WidgetProps>;
}

/** Widget types the app draws itself. The rest open in Homepage. */
export const WIDGETS: Record<string, WidgetType> = {
  service_grid: {
    label: "Services",
    icon: LayoutGrid,
    component: ServiceGridWidget,
  },
  service_link: { label: "Service", icon: Globe, component: ServiceLinkWidget },
  dashboard_links: {
    label: "Service links",
    icon: Link,
    component: ServiceLinksWidget,
  },
  service_links: {
    label: "Service links",
    icon: Link,
    component: ServiceLinksWidget,
  },
  bookmark_list: {
    label: "Bookmarks",
    icon: Bookmark,
    component: BookmarkListWidget,
  },
  link_tree: { label: "Links", icon: ListTree, component: LinkTreeWidget },
  search_links: { label: "Search", icon: Search, component: SearchLinksWidget },
  search_bar: { label: "Search", icon: Search, component: SearchBarWidget },
  clock: { label: "Clock", icon: Clock, component: ClockWidget },
  countdown: { label: "Countdown", icon: Timer, component: CountdownWidget },
  calendar: { label: "Calendar", icon: Calendar, component: CalendarWidget },
  notes: { label: "Notes", icon: StickyNote, component: NotesWidget },
  markdown_notes: { label: "Notes", icon: StickyNote, component: NotesWidget },
  text_banner: { label: "Banner", icon: Type, component: TextBannerWidget },
  ping_status: { label: "Ping", icon: Radar, component: PingStatusWidget },
  host_status: { label: "Host", icon: Server, component: HostStatusWidget },
  host_grid: { label: "Hosts", icon: Server, component: HostGridWidget },
  quick_connect: {
    label: "Quick connect",
    icon: Zap,
    component: QuickConnectWidget,
  },
  ssh_quick_connect: {
    label: "Quick connect",
    icon: Zap,
    component: QuickConnectWidget,
  },
  rss_feed: { label: "Feed", icon: Rss, component: RssFeedWidget },
  weather: { label: "Weather", icon: CloudSun, component: WeatherWidget },
  custom_api: { label: "Custom API", icon: Code, component: CustomApiWidget },
  image_widget: { label: "Picture", icon: ImageIcon, component: ImageWidget },
};

/** Grid headings only; the phone lists cards without them. */
export const SKIPPED_TYPES = new Set(["folder"]);

export function widgetType(typeId: string): WidgetType {
  return WIDGETS[typeId] ?? { label: "Widget", icon: LayoutGrid };
}
