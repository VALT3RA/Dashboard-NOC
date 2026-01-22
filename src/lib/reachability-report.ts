import "server-only";

import { addMonths } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import {
  fetchHostGroups,
  fetchProblems,
  fetchRecoveryEvents,
  fetchTriggersByIds,
  ZabbixItem,
  ZabbixProblem,
  ZabbixTrigger,
} from "@/lib/zabbix";
import { SEVERITY_LEVELS } from "@/lib/metrics";

const DEFAULT_TIMEZONE =
  process.env.DASHBOARD_TIMEZONE ?? "America/Sao_Paulo";
const BUSINESS_START_HOUR = Number(
  process.env.DASHBOARD_BUSINESS_START_HOUR ?? "7"
);
const BUSINESS_END_HOUR = Number(
  process.env.DASHBOARD_BUSINESS_END_HOUR ?? "24"
);
const SHIFT_STEP_MINUTES = Number(
  process.env.DASHBOARD_SHIFT_STEP_MINUTES ?? "5"
);
const SHIFT_STEP_MS = SHIFT_STEP_MINUTES * 60 * 1000;
const BUSINESS_START_MINUTES = BUSINESS_START_HOUR * 60;
const BUSINESS_END_MINUTES = BUSINESS_END_HOUR * 60;

const DEFAULT_REACHABILITY_ALERT_TYPES = [
  "ICMP",
  "Zabbix agent",
  "Uptime",
  "SNMP",
];
const REACHABILITY_ALERT_TYPES = new Set(
  (
    process.env.DASHBOARD_REACHABILITY_ALERT_TYPES ??
    DEFAULT_REACHABILITY_ALERT_TYPES.join(",")
  )
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

const severityLabelMap = new Map(
  SEVERITY_LEVELS.map((level) => [level.key, level.label])
);

export type ReachabilityWindow = "business" | "overall";

export type ReachabilityAlertRecord = {
  eventId: string;
  triggerId?: string;
  name: string;
  severity: number;
  severityLabel: string;
  openedAt: string;
  closedAt: string | null;
  isOpen: boolean;
  alertType: string;
  itemKeys: string[];
  hostNames: string[];
  windowMinutes: number;
  totalMinutes: number;
  businessMinutes: number;
};

export type ReachabilityReport = {
  groupId: string;
  groupLabel: string;
  monthLabel: string;
  window: ReachabilityWindow;
  windowLabel: string;
  page: number;
  pageSize: number;
  total: number;
  pages: number;
  alerts: ReachabilityAlertRecord[];
};

type TriggerTypeInfo = {
  alertType: string;
  itemKeys: string[];
};

export async function buildReachabilityReport(params: {
  groupId: string;
  month: string;
  window: ReachabilityWindow;
  page: number;
  pageSize: number;
}): Promise<ReachabilityReport> {
  const { groupId, month, window, page, pageSize } = params;
  const { startSeconds, endSeconds, label } = getRangeFromMonth(month);

  const groups = await fetchHostGroups();
  const group = groups.find((entry) => entry.groupid === groupId);
  if (!group) {
    throw new Error(`Host group ${groupId} nao encontrado no Zabbix.`);
  }

  const problems = await fetchProblems({
    groupId,
    timeFrom: startSeconds,
    timeTill: endSeconds,
  });
  const recoveryMap = await fetchRecoveryEvents(
    problems
      .map((problem) => problem.r_eventid)
      .filter((id): id is string => Boolean(id && id !== "0"))
  );
  const triggerTypeMap = await buildTriggerTypeMapFromProblems(problems);

  const alerts: ReachabilityAlertRecord[] = [];

  for (const problem of problems) {
    const rawClock = Number(problem.clock);
    if (!Number.isFinite(rawClock)) continue;

    const triggerId =
      problem.objectid && problem.objectid !== "0"
        ? String(problem.objectid)
        : undefined;
    const triggerInfo = triggerId ? triggerTypeMap.get(triggerId) : null;
    const fallback = deriveAlertType([], problem.name);
    const info = triggerInfo ?? fallback;
    if (!isReachabilityAlertType(info.alertType)) {
      continue;
    }

    const problemStart = Math.max(rawClock, startSeconds);
    const rawRecovery = problem.r_eventid
      ? recoveryMap[problem.r_eventid]?.clock
      : undefined;
    const resolvedSeconds =
      rawRecovery !== undefined && rawRecovery !== null
        ? Number(rawRecovery)
        : null;
    const problemEnd = Math.min(
      resolvedSeconds !== null ? resolvedSeconds : endSeconds,
      endSeconds
    );
    const totalSeconds = Math.max(0, problemEnd - problemStart);
    if (!totalSeconds) continue;

    const split = splitSecondsByShift(problemStart, problemEnd);
    const businessSeconds = split.business;
    const windowSeconds = window === "business" ? businessSeconds : totalSeconds;
    if (windowSeconds <= 0) continue;

    const severity = Number(problem.severity ?? 0);
    const severityLabel =
      severityLabelMap.get(severity) ?? `Severidade ${severity}`;
    const hostNames = Array.from(
      new Set(
        (problem.hosts ?? [])
          .map((host) => host.name)
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));

    alerts.push({
      eventId: String(problem.eventid),
      triggerId,
      name: problem.name,
      severity,
      severityLabel,
      openedAt: new Date(problemStart * 1000).toISOString(),
      closedAt:
        resolvedSeconds !== null
          ? new Date(resolvedSeconds * 1000).toISOString()
          : null,
      isOpen: !problem.r_eventid || problem.r_eventid === "0",
      alertType: info.alertType,
      itemKeys: [...info.itemKeys].sort((a, b) => a.localeCompare(b)),
      hostNames,
      windowMinutes: secondsToMinutes(windowSeconds),
      totalMinutes: secondsToMinutes(totalSeconds),
      businessMinutes: secondsToMinutes(businessSeconds),
    });
  }

  alerts.sort((a, b) => {
    const delta = b.windowMinutes - a.windowMinutes;
    if (delta !== 0) return delta;
    return (
      new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()
    );
  });

  const total = alerts.length;
  const safePageSize = Math.max(1, pageSize);
  const pages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(1, page), pages);
  const startIndex = (safePage - 1) * safePageSize;
  const pageItems = alerts.slice(startIndex, startIndex + safePageSize);

  return {
    groupId: group.groupid,
    groupLabel: group.name,
    monthLabel: label,
    window,
    windowLabel:
      window === "business" ? formatBusinessWindowLabel() : "Periodo completo",
    page: safePage,
    pageSize: safePageSize,
    total,
    pages,
    alerts: pageItems,
  };
}

function isReachabilityAlertType(alertType: string): boolean {
  return REACHABILITY_ALERT_TYPES.has(alertType.toLowerCase());
}

function secondsToMinutes(value: number): number {
  if (!value || Number.isNaN(value)) return 0;
  return value / 60;
}

function getRangeFromMonth(month: string): {
  startSeconds: number;
  endSeconds: number;
  label: string;
} {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  if (Number.isNaN(year) || Number.isNaN(monthIndex)) {
    throw new Error("Formato de mes invalido. Use AAAA-MM.");
  }

  const startDate = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0));
  const endDate = addMonths(startDate, 1);
  const labelDate = new Date(Date.UTC(year, monthIndex, 1, 12, 0, 0));

  return {
    startSeconds: Math.floor(startDate.getTime() / 1000),
    endSeconds: Math.floor(endDate.getTime() / 1000),
    label: formatInTimeZone(labelDate, DEFAULT_TIMEZONE, "MMMM yyyy", {
      locale: ptBR,
    }),
  };
}

function formatBusinessWindowLabel(): string {
  const startLabel = `${BUSINESS_START_HOUR}h`;
  const endLabel = BUSINESS_END_HOUR >= 24 ? "23:59" : `${BUSINESS_END_HOUR}h`;
  return `${startLabel}-${endLabel} (${DEFAULT_TIMEZONE})`;
}

function splitSecondsByShift(
  startSeconds: number,
  endSeconds: number
): { business: number; off: number } {
  if (endSeconds <= startSeconds) {
    return { business: 0, off: 0 };
  }

  let business = 0;
  let offHours = 0;
  let cursor = startSeconds * 1000;
  const limit = endSeconds * 1000;

  while (cursor < limit) {
    const next = Math.min(cursor + SHIFT_STEP_MS, limit);
    const duration = next - cursor;
    const minutesOfDay = getMinutesOfDay(new Date(cursor));
    const isBusiness =
      minutesOfDay >= BUSINESS_START_MINUTES &&
      minutesOfDay < BUSINESS_END_MINUTES;

    if (isBusiness) {
      business += duration / 1000;
    } else {
      offHours += duration / 1000;
    }

    cursor = next;
  }

  return { business, off: offHours };
}

function getMinutesOfDay(date: Date) {
  const hours = Number(formatInTimeZone(date, DEFAULT_TIMEZONE, "H"));
  const minutes = Number(formatInTimeZone(date, DEFAULT_TIMEZONE, "m"));
  return hours * 60 + minutes;
}

function deriveAlertType(
  items: ZabbixItem[],
  fallbackText: string
): TriggerTypeInfo {
  const itemKeys = Array.from(
    new Set(
      items
        .map((item) => item.key_)
        .filter((key): key is string => Boolean(key))
    )
  );
  const haystack = `${itemKeys.join(" ")} ${fallbackText}`.toLowerCase();

  if (haystack.includes("icmpping") || haystack.includes("icmp")) {
    return { alertType: "ICMP", itemKeys };
  }
  if (haystack.includes("snmp")) {
    return { alertType: "SNMP", itemKeys };
  }
  if (haystack.includes("agent")) {
    return { alertType: "Zabbix agent", itemKeys };
  }
  if (haystack.includes("http") || haystack.includes("web")) {
    return { alertType: "HTTP", itemKeys };
  }
  if (
    haystack.includes("net.tcp") ||
    haystack.includes("tcp") ||
    haystack.includes("udp")
  ) {
    return { alertType: "Porta/TCP", itemKeys };
  }
  if (haystack.includes("log")) {
    return { alertType: "Log", itemKeys };
  }
  if (haystack.includes("system.uptime")) {
    return { alertType: "Uptime", itemKeys };
  }

  return { alertType: "Outro", itemKeys };
}

async function buildTriggerTypeMapFromProblems(
  problems: ZabbixProblem[]
): Promise<Map<string, TriggerTypeInfo>> {
  const triggerIds = Array.from(
    new Set(
      problems
        .map((problem) => problem.objectid)
        .filter((id): id is string => Boolean(id && id !== "0"))
    )
  );
  if (!triggerIds.length) {
    return new Map<string, TriggerTypeInfo>();
  }

  const triggers = await fetchTriggersByIds(triggerIds);
  return buildTriggerTypeMap(triggers);
}

function buildTriggerTypeMap(
  triggers: ZabbixTrigger[]
): Map<string, TriggerTypeInfo> {
  const map = new Map<string, TriggerTypeInfo>();
  for (const trigger of triggers) {
    const text = [trigger.description, trigger.comments].filter(Boolean).join(" ");
    map.set(trigger.triggerid, deriveAlertType(trigger.items ?? [], text));
  }
  return map;
}
