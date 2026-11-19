import { useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "@/ui";
import { bool, Empty, str, type WidgetProps } from "./shared";

/** The current time, ticking while the card is shown. */
function useNow(active: boolean, everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [active, everyMs]);
  return now;
}

function format(
  now: number,
  options: Intl.DateTimeFormatOptions,
  timeZone?: string,
): string {
  try {
    return new Date(now).toLocaleString(undefined, { ...options, timeZone });
  } catch {
    // An unknown time zone name falls back to the phone's.
    return new Date(now).toLocaleString(undefined, options);
  }
}

export function ClockWidget({ item, active }: WidgetProps) {
  const seconds = bool(item.config.showSeconds, false);
  const zone = str(item.config.timezone) || undefined;
  const now = useNow(active, seconds ? 1000 : 15_000);
  const time = format(
    now,
    {
      hour: "numeric",
      minute: "2-digit",
      second: seconds ? "2-digit" : undefined,
      hour12: str(item.config.format, "24h") === "12h",
    },
    zone,
  );
  const date = format(
    now,
    { weekday: "long", month: "long", day: "numeric" },
    zone,
  );
  return (
    <View className="items-center gap-0.5 px-3 py-3">
      <Text weight="bold" className="text-3xl text-foreground">
        {time}
      </Text>
      <Text className="text-[11px] text-muted-foreground">
        {zone ? `${date} | ${zone}` : date}
      </Text>
    </View>
  );
}

/** Days, hours, minutes and seconds left, never below zero. */
export function remaining(target: number, now: number) {
  const left = Math.max(0, target - now);
  const s = Math.floor(left / 1000);
  return {
    done: left === 0,
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

export function CountdownWidget({ item, active }: WidgetProps) {
  const now = useNow(active, 1000);
  const target = Date.parse(str(item.config.targetDate));
  if (!Number.isFinite(target)) return <Empty>No date set.</Empty>;
  const left = remaining(target, now);
  const showDays = bool(item.config.showDays, true);
  const showHours = bool(item.config.showHours, true);
  const parts: [string, number][] = [];
  if (showDays) parts.push(["days", left.days]);
  if (showHours)
    parts.push(["hours", showDays ? left.hours : left.days * 24 + left.hours]);
  parts.push(["min", left.minutes], ["sec", left.seconds]);
  return (
    <View className="gap-2 px-3 py-3">
      {str(item.config.label) ? (
        <Text className="text-center text-[12px] text-muted-foreground">
          {str(item.config.label)}
        </Text>
      ) : null}
      {left.done ? (
        <Text weight="bold" className="text-center text-xl text-foreground">
          Time is up
        </Text>
      ) : (
        <View className="flex-row justify-center gap-4">
          {parts.map(([label, value]) => (
            <View key={label} className="items-center">
              <Text weight="bold" className="text-2xl text-foreground">
                {String(value).padStart(2, "0")}
              </Text>
              <Text className="text-[10px] uppercase text-muted-foreground">
                {label}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** Blank cells before day 1 and the number of days, for a month grid. */
export function monthGrid(
  year: number,
  month: number,
  startOnMonday: boolean,
): { offset: number; days: number } {
  const first = new Date(year, month, 1).getDay();
  return {
    offset: startOnMonday ? (first + 6) % 7 : first,
    days: new Date(year, month + 1, 0).getDate(),
  };
}

export function CalendarWidget({ item, active }: WidgetProps) {
  const now = new Date(useNow(active, 60_000));
  const monday = bool(item.config.startOnMonday, false);
  const { offset, days } = monthGrid(now.getFullYear(), now.getMonth(), monday);
  const names = monday
    ? ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
    : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  return (
    <View className="gap-2 px-3 py-2.5">
      <Text weight="bold" className="text-sm text-foreground">
        {now.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
      </Text>
      <View className="flex-row flex-wrap">
        {names.map((n) => (
          <Text
            key={n}
            className="w-[14.28%] text-center text-[10px] text-muted-foreground"
          >
            {n}
          </Text>
        ))}
        {cells.map((day, index) => {
          const today = day === now.getDate();
          return (
            <View key={index} className="w-[14.28%] items-center py-1">
              {day ? (
                <View
                  className={`h-6 w-6 items-center justify-center ${today ? "bg-accent-brand" : ""}`}
                >
                  <Text
                    className={`text-[12px] ${today ? "text-background" : "text-foreground"}`}
                  >
                    {day}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}
