import { createElement } from "react";
import {
  Activity,
  Bookmark,
  Box,
  Boxes,
  Briefcase,
  Bug,
  Building,
  Building2,
  Cloud,
  CloudCog,
  Code,
  Cog,
  Container,
  Cpu,
  Database,
  Flag,
  Flame,
  FlaskConical,
  Folder,
  FolderGit2,
  FolderOpen,
  Gauge,
  GitBranch,
  Globe,
  Globe2,
  Hammer,
  HardDrive,
  Home,
  Key,
  Layers,
  Leaf,
  Lock,
  Mail,
  MemoryStick,
  Monitor,
  Network,
  Rocket,
  Router,
  Server,
  ServerCog,
  Settings,
  Shield,
  ShieldCheck,
  Smartphone,
  Star,
  Tag,
  Terminal,
  User,
  Users,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react-native";

/** Same ids and order as core's folder and host icon picker. */
export const LOOK_ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  "folder-open": FolderOpen,
  "folder-git": FolderGit2,
  server: Server,
  "server-cog": ServerCog,
  cloud: Cloud,
  "cloud-cog": CloudCog,
  database: Database,
  "hard-drive": HardDrive,
  box: Box,
  boxes: Boxes,
  container: Container,
  network: Network,
  router: Router,
  wifi: Wifi,
  globe: Globe,
  "globe-2": Globe2,
  terminal: Terminal,
  cpu: Cpu,
  memory: MemoryStick,
  shield: Shield,
  "shield-check": ShieldCheck,
  lock: Lock,
  key: Key,
  rocket: Rocket,
  flask: FlaskConical,
  wrench: Wrench,
  hammer: Hammer,
  gauge: Gauge,
  activity: Activity,
  layers: Layers,
  building: Building,
  "building-2": Building2,
  home: Home,
  briefcase: Briefcase,
  code: Code,
  "git-branch": GitBranch,
  bug: Bug,
  settings: Settings,
  cog: Cog,
  star: Star,
  flag: Flag,
  bookmark: Bookmark,
  tag: Tag,
  users: Users,
  user: User,
  zap: Zap,
  flame: Flame,
  leaf: Leaf,
  mail: Mail,
  monitor: Monitor,
  smartphone: Smartphone,
};

export const LOOK_COLORS = [
  "#f59145",
  "#ef4444",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#6b7280",
];

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isLookColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

/** An icon by its saved name, or null when the name is unknown. */
export function lookIcon(name: string | null | undefined): LucideIcon | null {
  return (name && LOOK_ICONS[name]) || null;
}

export function LookIcon({
  name,
  color,
  size = 14,
  fallback = Server,
}: {
  name?: string | null;
  color: string;
  size?: number;
  fallback?: LucideIcon;
}) {
  return createElement(lookIcon(name) ?? fallback, { size, color });
}
