import "server-only";

import { addMonths } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import {
  fetchHostGroups,
  fetchHostsByIds,
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
export type ReachabilityScope = "group" | "all";

export type ReachabilityAlertRecord = {
  eventId: string;
  triggerId?: string;
  name: string;
  severity: number;
  severityLabel: string;
  openedAt: string;
  closedAt: string | null;
  isOpen: boolean;
  openedInBusinessWindow: boolean;
  groupName?: string;
  alertType: string;
  itemKeys: string[];
  hostNames: string[];
  windowMinutes: number;
  totalMinutes: number;
  businessMinutes: number;
};

export type ReachabilityReport = {
  scope: ReachabilityScope;
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
  isReachability: boolean;
};

export async function buildReachabilityReport(params: {
  groupId?: string;
  groupIds?: string[];
  scope?: ReachabilityScope;
  month: string;
  window: ReachabilityWindow;
  page: number;
  pageSize: number;
}): Promise<ReachabilityReport> {
  const { groupId, month, window, page, pageSize } = params;
  const { startSeconds, endSeconds, label } = getRangeFromMonth(month);
  const isAllScope = params.scope === "all" || groupId === "all";
  const selectedGroupIds = (params.groupIds ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  const hasSelectedGroupIds = selectedGroupIds.length > 0;

  if (!isAllScope && !groupId) {
    throw new Error("Host group nao informado.");
  }

  const groups = await fetchHostGroups();
  const relevantGroups = groups.filter((entry) =>
    isRelevantGroupName(entry.name)
  );
  const selectedGroups = hasSelectedGroupIds
    ? groups.filter((entry) => selectedGroupIds.includes(entry.groupid))
    : [];
  const allowedGroupNames = new Set(
    hasSelectedGroupIds
      ? selectedGroups.map((entry) => entry.name)
      : relevantGroups.map((entry) => entry.name)
  );
  const resolvedGroup = !isAllScope
    ? groups.find((entry) => entry.groupid === groupId)
    : null;
  if (!isAllScope && !resolvedGroup) {
    throw new Error(`Host group ${groupId ?? ""} nao encontrado no Zabbix.`);
  }

  const problems = await fetchProblems({
    groupId: isAllScope ? undefined : groupId,
    groupIds: isAllScope && hasSelectedGroupIds ? selectedGroupIds : undefined,
    timeFrom: startSeconds,
    timeTill: endSeconds,
  });
  const recoveryMap = await fetchRecoveryEvents(
    problems
      .map((problem) => problem.r_eventid)
      .filter((id): id is string => Boolean(id && id !== "0"))
  );
  const triggerTypeMap = await buildTriggerTypeMapFromProblems(problems);

  const hostGroupNamesByHost = isAllScope
    ? await buildHostGroupNameMap(problems, allowedGroupNames)
    : new Map<string, string[]>();
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
    if (!isReachabilityAlertType(info)) {
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
    const groupNames = isAllScope
      ? getGroupNamesForProblem(problem, hostGroupNamesByHost)
      : [];
    if (isAllScope && groupNames.length === 0) {
      continue;
    }
    const targetGroupNames = isAllScope ? groupNames : [undefined];

    for (const groupName of targetGroupNames) {
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
        openedInBusinessWindow: isWithinBusinessWindow(
          new Date(problemStart * 1000)
        ),
        groupName,
        alertType: info.alertType,
        itemKeys: [...info.itemKeys].sort((a, b) => a.localeCompare(b)),
        hostNames,
        windowMinutes: secondsToMinutes(windowSeconds),
        totalMinutes: secondsToMinutes(totalSeconds),
        businessMinutes: secondsToMinutes(businessSeconds),
      });
    }
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
  const selectionLabel = isAllScope && hasSelectedGroupIds
    ? formatGroupSelectionLabel(selectedGroups, selectedGroupIds.length)
    : null;

  return {
    scope: isAllScope ? "all" : "group",
    groupId: resolvedGroup?.groupid ?? "all",
    groupLabel:
      resolvedGroup?.name ??
      selectionLabel ??
      "Todos os host groups",
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

function isReachabilityAlertType(info: TriggerTypeInfo): boolean {
  return (
    info.isReachability &&
    REACHABILITY_ALERT_TYPES.has(info.alertType.toLowerCase())
  );
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
  const now = new Date();
  const currentMonth = formatInTimeZone(now, DEFAULT_TIMEZONE, "yyyy-MM");
  const isCurrentMonth = `${yearStr}-${monthStr}` === currentMonth;
  const effectiveEndMs = isCurrentMonth
    ? Math.min(endDate.getTime(), now.getTime())
    : endDate.getTime();
  const labelDate = new Date(Date.UTC(year, monthIndex, 1, 12, 0, 0));

  return {
    startSeconds: Math.floor(startDate.getTime() / 1000),
    endSeconds: Math.floor(effectiveEndMs / 1000),
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

function isWithinBusinessWindow(date: Date): boolean {
  const minutesOfDay = getMinutesOfDay(date);
  return (
    minutesOfDay >= BUSINESS_START_MINUTES &&
    minutesOfDay < BUSINESS_END_MINUTES
  );
}

function isRelevantGroupName(name: string) {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("templates")) return false;
  if (normalized.startsWith("test")) return false;
  if (normalized === "discovered hosts") return false;
  return true;
}

async function buildHostGroupNameMap(
  problems: ZabbixProblem[],
  allowedGroupNames: Set<string>
) {
  const hostIds = new Set<string>();
  for (const problem of problems) {
    for (const host of problem.hosts ?? []) {
      if (host.hostid) {
        hostIds.add(host.hostid);
      }
    }
  }
  const hosts = await fetchHostsByIds([...hostIds]);
  const hostGroupMap = new Map<string, string[]>();

  for (const host of hosts) {
    const groupNames = (host.groups ?? [])
      .map((group) => group.name)
      .filter((name): name is string => Boolean(name))
      .filter((name) => isRelevantGroupName(name))
      .filter((name) => allowedGroupNames.has(name));
    hostGroupMap.set(host.hostid, Array.from(new Set(groupNames)).sort());
  }

  return hostGroupMap;
}

function getGroupNamesForProblem(
  problem: ZabbixProblem,
  hostGroupNamesByHost: Map<string, string[]>
) {
  const groupSet = new Set<string>();
  for (const host of problem.hosts ?? []) {
    const names = hostGroupNamesByHost.get(host.hostid) ?? [];
    for (const name of names) {
      groupSet.add(name);
    }
  }
  return Array.from(groupSet).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function formatGroupSelectionLabel(
  groups: Array<{ name: string }>,
  fallbackCount: number
) {
  if (!groups.length) {
    if (fallbackCount === 1) return "1 host group selecionado";
    if (fallbackCount > 1) return `${fallbackCount} host groups selecionados`;
    return "Host groups selecionados";
  }
  const names = groups.map((group) => group.name);
  if (names.length <= 2) {
    return names.join(", ");
  }
  const [first, second] = names;
  const remaining = names.length - 2;
  return `${first}, ${second} +${remaining}`;
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
  const isAgentAvailability = isAgentAvailabilityCheck(itemKeys, haystack);
  const isSnmpTrap = isSnmpTrapSignal(itemKeys, haystack);
  const isReachability = isReachabilitySignal(
    haystack,
    isAgentAvailability,
    isSnmpTrap
  );

  if (haystack.includes("icmpping") || haystack.includes("icmp")) {
    return { alertType: "ICMP", itemKeys, isReachability };
  }
  if (haystack.includes("snmp")) {
    return { alertType: "SNMP", itemKeys, isReachability };
  }
  if (isAgentAvailability) {
    return { alertType: "Zabbix agent", itemKeys, isReachability };
  }
  if (haystack.includes("http") || haystack.includes("web")) {
    return { alertType: "HTTP", itemKeys, isReachability };
  }
  if (
    haystack.includes("net.tcp") ||
    haystack.includes("tcp") ||
    haystack.includes("udp")
  ) {
    return { alertType: "Porta/TCP", itemKeys, isReachability };
  }
  if (haystack.includes("log")) {
    return { alertType: "Log", itemKeys, isReachability };
  }
  if (haystack.includes("system.uptime")) {
    return { alertType: "Uptime", itemKeys, isReachability };
  }

  return { alertType: "Outro", itemKeys, isReachability };
}

function isAgentAvailabilityCheck(itemKeys: string[], haystack: string): boolean {
  const keyHit = itemKeys.some((key) => {
    const normalized = key.toLowerCase();
    return (
      normalized.includes("agent.ping") ||
      normalized.includes("zabbix[host,agent,available]")
    );
  });
  if (keyHit) return true;

  return (
    haystack.includes("agent is not available") ||
    haystack.includes("zabbix agent is not available") ||
    haystack.includes("agent not available") ||
    haystack.includes("agent unavailable") ||
    haystack.includes("agent is unreachable") ||
    haystack.includes("zabbix agent is unreachable")
  );
}

function isReachabilitySignal(
  haystack: string,
  isAgentAvailability: boolean,
  isSnmpTrap: boolean
): boolean {
  if (isAgentAvailability) return true;
  if (isSnmpTrap) return false;
  if (haystack.includes("icmpping") || haystack.includes("icmp")) return true;
  if (haystack.includes("snmp")) return true;
  if (haystack.includes("system.uptime") || haystack.includes("uptime"))
    return true;
  return false;
}

function isSnmpTrapSignal(itemKeys: string[], haystack: string): boolean {
  const keyHit = itemKeys.some((key) => key.toLowerCase().includes("snmptrap"));
  if (keyHit) return true;
  return haystack.includes("snmptrap") || haystack.includes("snmp trap");
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
