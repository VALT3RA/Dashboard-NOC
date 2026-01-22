import { addMonths } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import {
  fetchHostGroups,
  fetchHosts,
  fetchHostsByIds,
  fetchProblems,
  fetchRecoveryEvents,
  fetchTriggersByIds,
  ZabbixHost,
  ZabbixHostGroup,
  ZabbixItem,
  ZabbixProblem,
  ZabbixTrigger,
} from "@/lib/zabbix";
import {
  AvailabilityAlertImpact,
  AvailabilityHostImpact,
  AvailabilityInsights,
  CriticalAlertHighlight,
  DashboardMetrics,
  HostGroupMetric,
  HostMetric,
  GroupAlertDetail,
} from "@/types/dashboard";

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
const PROBLEM_LOOKBACK_DAYS = Number(
  process.env.ZABBIX_PROBLEM_LOOKBACK_DAYS ?? "45"
);
const PROBLEM_LOOKBACK_SECONDS = Math.max(
  0,
  PROBLEM_LOOKBACK_DAYS * 24 * 60 * 60
);
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

type HostCategory = {
  id: string;
  label: string;
  keywords: RegExp[];
};

type Interval = {
  start: number;
  end: number;
};

export type HostCategoryStat = {
  id: string;
  label: string;
  count: number;
  coveragePct: number;
  slaPct: number;
};

const HOST_CATEGORIES: HostCategory[] = [
  {
    id: "servers",
    label: "Servidores",
    keywords: [/server/i, /servidor/i, /srv/i, /vm/i, /db/i],
  },
  {
    id: "endpoints",
    label: "Endpoints",
    keywords: [/notebook/i, /desktop/i, /endpoint/i, /workstation/i, /pc/i],
  },
  {
    id: "network",
    label: "Dispositivos de Rede",
    keywords: [/switch/i, /router/i, /firewall/i, /wifi/i, /ap/i, /gw/i],
  },
];

const DEFAULT_CATEGORY: HostCategory = {
  id: "others",
  label: "IoT/Outros",
  keywords: [],
};

export const SEVERITY_LEVELS = [
  { key: 5, label: "Desastre" },
  { key: 4, label: "Alta" },
  { key: 3, label: "Média" },
  { key: 2, label: "Baixa" },
  { key: 1, label: "Informativo" },
  { key: 0, label: "Não classificado" },
] as const;

type SeverityCounter = Record<number, number>;

function createSeverityCounter(): SeverityCounter {
  const counter: SeverityCounter = {};
  for (const level of SEVERITY_LEVELS) {
    counter[level.key] = 0;
  }
  return counter;
}

function safeAverage(values: number[], fallback = 0): number {
  if (!values.length) return fallback;
  const sum = values.reduce((acc, cur) => acc + cur, 0);
  return sum / values.length;
}

function secondsToMinutes(value: number): number {
  if (!value || Number.isNaN(value)) return 0;
  return value / 60;
}

function isReachabilityAlertType(alertType: string): boolean {
  return REACHABILITY_ALERT_TYPES.has(alertType.toLowerCase());
}

function sumDowntimeForHosts(
  downtime: Map<string, { total: number; business: number; off: number }>,
  hostIds: Set<string>,
  key: "total" | "business" | "off"
): number {
  let total = 0;
  for (const [hostId, entry] of downtime.entries()) {
    if (hostIds.has(hostId)) {
      total += entry[key];
    }
  }
  return total;
}

function classifyHost(host: ZabbixHost): HostCategory {
  const haystack = [
    host.name,
    host.inventory?.type_full,
    host.inventory?.type,
    host.inventory?.hardware,
    host.inventory?.alias,
    ...(host.tags?.map((tag) => `${tag.tag}:${tag.value}`) ?? []),
    ...(host.groups?.map((group) => group.name) ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const category =
    HOST_CATEGORIES.find((cat) => cat.keywords.some((k) => k.test(haystack))) ??
    DEFAULT_CATEGORY;

  return category;
}

function detectFalseClassification(problem: ZabbixProblem) {
  const haystack = [
    problem.name,
    ...(problem.tags?.map((tag) => `${tag.tag}:${tag.value}`) ?? []),
    ...(problem.acknowledges?.map((ack) => ack.message ?? "") ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    haystack.includes("falso positivo") ||
    haystack.includes("false positive") ||
    /\bfp\b/.test(haystack)
  ) {
    return "fp";
  }

  if (
    haystack.includes("falso negativo") ||
    haystack.includes("false negative") ||
    /\bfn\b/.test(haystack)
  ) {
    return "fn";
  }

  return "tp";
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

function getRangeFromMonth(month: string): {
  startSeconds: number;
  endSeconds: number;
  label: string;
} {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  if (Number.isNaN(year) || Number.isNaN(monthIndex)) {
    throw new Error("Formato de mês inválido. Use AAAA-MM.");
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

type BuildOptions = {
  includeGroupStats?: boolean;
  includeAlertDetails?: boolean;
  includeAvailabilityInsights?: boolean;
};

export async function buildDashboardMetrics(
  input: {
    month: string;
    groupId?: string;
    groupIds?: string[];
  },
  options?: BuildOptions
): Promise<DashboardMetrics> {
  const includeGroupStats = options?.includeGroupStats ?? false;
  const includeAlertDetails = options?.includeAlertDetails ?? false;
  const includeAvailabilityInsights =
    options?.includeAvailabilityInsights ?? false;
  const { startSeconds, endSeconds, label } = getRangeFromMonth(input.month);
  const problemFetchStart = Math.max(0, startSeconds - PROBLEM_LOOKBACK_SECONDS);
  const [hosts, problems, hostGroups] = await Promise.all([
    fetchHosts(input.groupIds ?? input.groupId),
    fetchProblems({
      groupId: input.groupId,
      groupIds: input.groupIds,
      timeFrom: problemFetchStart,
      timeTill: endSeconds,
    }),
    fetchHostGroups(),
  ]);

  const hostIdSet = new Set(hosts.map((host) => host.hostid));
  const problemHostIds = new Set<string>();
  for (const problem of problems) {
    for (const host of problem.hosts ?? []) {
      if (host.hostid) {
        problemHostIds.add(host.hostid);
      }
    }
  }

  const missingHostIds = Array.from(problemHostIds).filter(
    (hostId) => hostId && !hostIdSet.has(hostId)
  );

  if (missingHostIds.length) {
    const extraHosts = await fetchHostsByIds(missingHostIds);
    for (const host of extraHosts) {
      if (!hostIdSet.has(host.hostid)) {
        hosts.push(host);
        hostIdSet.add(host.hostid);
      }
    }
  }

  const recoveryEventMap = await fetchRecoveryEvents(
    problems
      .map((problem) => problem.r_eventid)
      .filter((id): id is string => Boolean(id && id !== "0"))
  );

  const triggerTypeMap = await buildTriggerTypeMapFromProblems(problems);

  let hostDowntime = new Map<
    string,
    { total: number; business: number; off: number }
  >();
  let reachabilityHostDowntime = new Map<
    string,
    { total: number; business: number; off: number }
  >();
  const hostIntervals = new Map<string, Interval[]>();
  const reachabilityIntervals = new Map<string, Interval[]>();
  const hostDurationSamples = new Map<
    string,
    { detection: number[]; response: number[]; resolution: number[] }
  >();
  const hostEventCount = new Map<string, number>();
  const hostOpenCount = new Map<string, number>();
  const hostNameMap = new Map<string, string>();
  const hostGroupMap = new Map<string, ZabbixHostGroup[]>();
  const isReachabilityProblem = (problem: ZabbixProblem) => {
    const triggerId =
      problem.objectid && problem.objectid !== "0"
        ? String(problem.objectid)
        : null;
    const triggerInfo = triggerId ? triggerTypeMap.get(triggerId) : null;
    const info = triggerInfo ?? deriveAlertType([], problem.name);
    return isReachabilityAlertType(info.alertType);
  };

  function isActive(host: ZabbixHost) {
    // status: 0=monitored/active, 1=disabled
    return host.status === undefined || host.status === "0" || host.status === 0;
  }

  const activeHostList = hosts.filter(isActive);
  const activeHostIds = new Set(activeHostList.map((host) => host.hostid));
  const activeHosts = activeHostList.length;
  const inactiveHostCount = hosts.length - activeHosts;

  const groupAccumulators: Map<string, GroupAccumulator> | undefined =
    includeGroupStats
      ? new Map(
          hostGroups.map((group) => [
            group.groupid,
            createGroupAccumulator(group),
          ])
        )
      : undefined;

  for (const host of hosts) {
    hostNameMap.set(host.hostid, host.name);
    hostGroupMap.set(host.hostid, host.groups ?? []);
  }

  if (groupAccumulators) {
    for (const host of hosts) {
      for (const group of host.groups ?? []) {
        const acc =
          groupAccumulators.get(group.groupid) ??
          createGroupAccumulator(group);
        if (!acc.hostIds.has(host.hostid)) {
          acc.hostIds.add(host.hostid);
          if (isActive(host)) {
            acc.activeHosts += 1;
            acc.activeHostIds.add(host.hostid);
          } else {
            acc.inactiveHosts += 1;
            acc.inactiveHostIds.add(host.hostid);
          }
        }
        groupAccumulators.set(group.groupid, acc);
      }
    }
  }

  const detectionDurations: number[] = [];
  const responseDurations: number[] = [];
  const resolutionDurations: number[] = [];
  const severityTotals = createSeverityCounter();
  const criticalAlerts: CriticalAlertHighlight[] = [];
  let impactIncidents = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  for (const problem of problems) {
    const rawClock = Number(problem.clock);
    const triggerId =
      problem.objectid && problem.objectid !== "0"
        ? String(problem.objectid)
        : undefined;
    const startsInsideRange =
      Number.isFinite(rawClock) &&
      rawClock >= startSeconds &&
      rawClock < endSeconds;
    const problemStart = Math.max(rawClock, startSeconds);
    const severityKey = Number(problem.severity ?? 0);
    const severityLevel = Number.isFinite(severityKey) ? severityKey : null;
    const shouldCountAlert = startsInsideRange;
    const isOpen = !problem.r_eventid || problem.r_eventid === "0";
    if (severityLevel !== null && shouldCountAlert) {
      severityTotals[severityLevel] = (severityTotals[severityLevel] ?? 0) + 1;
    }
    const rawRecovery = problem.r_eventid
      ? recoveryEventMap[problem.r_eventid]?.clock
      : undefined;
    const resolvedSeconds =
      rawRecovery !== undefined && rawRecovery !== null
        ? Number(rawRecovery)
        : null;
    const hasResolution =
      resolvedSeconds !== null && Number.isFinite(resolvedSeconds);
    const resolvedInsideRange =
      hasResolution &&
      resolvedSeconds >= startSeconds &&
      resolvedSeconds < endSeconds;
    const qualifiesForResolutionMetrics =
      startsInsideRange && resolvedInsideRange && hasResolution;
    const problemEnd = Math.min(
      resolvedSeconds !== null ? resolvedSeconds : endSeconds,
      endSeconds
    );
    const durationSeconds = Math.max(0, problemEnd - problemStart);
    const hasOverlap = durationSeconds > 0;
    const reachabilityProblem = hasOverlap && isReachabilityProblem(problem);

    const acknowledges = [...(problem.acknowledges ?? [])].sort((a, b) => {
      return Number(a.clock) - Number(b.clock);
    });
    const firstAckSeconds =
      acknowledges.length > 0 ? Number(acknowledges[0].clock) : null;
    const secondAckSeconds =
      acknowledges.length > 1
        ? Number(acknowledges[1].clock)
        : firstAckSeconds;
    let detectionDelta: number | null = null;
    let responseDelta: number | null = null;
    if (acknowledges.length && hasOverlap) {
      const firstAck = Number(acknowledges[0].clock);
      detectionDelta = Math.max(0, firstAck - problemStart);
      detectionDurations.push(detectionDelta);
      responseDelta = detectionDelta;
      responseDurations.push(responseDelta);
    }

    const resolutionDeltaForMetrics =
      qualifiesForResolutionMetrics && hasResolution
        ? Math.max(0, resolvedSeconds - rawClock)
        : null;
    if (resolutionDeltaForMetrics !== null) {
      resolutionDurations.push(resolutionDeltaForMetrics);
    }

    const durationMinutes = secondsToMinutes(durationSeconds);
    const detectionMinutesDetail =
      detectionDelta !== null ? secondsToMinutes(detectionDelta) : null;
    const responseMinutesDetail =
      secondAckSeconds !== null
        ? secondsToMinutes(Math.max(0, secondAckSeconds - problemStart))
        : detectionMinutesDetail;

    const shiftDurations = hasOverlap
      ? splitSecondsByShift(problemStart, problemEnd)
      : { business: 0, off: 0 };
    const hasBusinessImpact =
      severityLevel === 5 &&
      shouldCountAlert &&
      shiftDurations.business > 0;
    const isSlowToNormalize = durationMinutes > 60;
    const qualifiesForImpact = hasBusinessImpact && isSlowToNormalize;

    if (qualifiesForImpact) {
      impactIncidents += 1;
    }

    const highlightHostIds: string[] = [];
    const highlightHostNames: string[] = [];
    const highlightGroupMap = new Map<string, string>();
    const problemHostNames =
      problem.hosts?.map((host) => host.name).filter(Boolean) ?? [];
    const closedAt =
      !isOpen && resolvedSeconds !== null
        ? new Date(Math.min(resolvedSeconds, endSeconds) * 1000).toISOString()
        : null;
    const closedAtActual =
      !isOpen && resolvedSeconds !== null
        ? new Date(resolvedSeconds * 1000).toISOString()
        : null;
    const openedAt = Number.isFinite(rawClock)
      ? new Date(rawClock * 1000).toISOString()
      : new Date(problemStart * 1000).toISOString();
    const firstAckAt =
      firstAckSeconds !== null
        ? new Date(firstAckSeconds * 1000).toISOString()
        : null;
    const secondAckAt =
      secondAckSeconds !== null
        ? new Date(secondAckSeconds * 1000).toISOString()
        : null;

    for (const host of problem.hosts ?? []) {
      const hostIsActive = activeHostIds.has(host.hostid);
      hostNameMap.set(host.hostid, host.name);

      if (shouldCountAlert) {
        hostEventCount.set(
          host.hostid,
          (hostEventCount.get(host.hostid) ?? 0) + 1
        );
        if (!problem.r_eventid || problem.r_eventid === "0") {
          hostOpenCount.set(
            host.hostid,
            (hostOpenCount.get(host.hostid) ?? 0) + 1
          );
        }
      }

      if (hasOverlap) {
        const intervals = hostIntervals.get(host.hostid) ?? [];
        intervals.push({ start: problemStart, end: problemEnd });
        hostIntervals.set(host.hostid, intervals);
      }
      if (reachabilityProblem) {
        const intervals = reachabilityIntervals.get(host.hostid) ?? [];
        intervals.push({ start: problemStart, end: problemEnd });
        reachabilityIntervals.set(host.hostid, intervals);
      }

      const durationSample = hostDurationSamples.get(host.hostid) ?? {
        detection: [],
        response: [],
        resolution: [],
      };
      if (hasOverlap) {
        if (detectionDelta !== null) {
          durationSample.detection.push(detectionDelta);
        }
        if (responseDelta !== null) {
          durationSample.response.push(responseDelta);
        }
        if (resolutionDeltaForMetrics !== null) {
          durationSample.resolution.push(resolutionDeltaForMetrics);
        }
        hostDurationSamples.set(host.hostid, durationSample);
      }

      if (groupAccumulators) {
        const memberships = hostGroupMap.get(host.hostid) ?? [];
        for (const group of memberships) {
          const acc =
            groupAccumulators.get(group.groupid) ??
            createGroupAccumulator(group);
          const eventKey = String(problem.eventid ?? "");
          if (eventKey && shouldCountAlert) {
            if (!acc.eventIds.has(eventKey)) {
              acc.eventIds.add(eventKey);
              acc.eventCount += 1;
            }
            if (!problem.r_eventid || problem.r_eventid === "0") {
              if (!acc.openEventIds.has(eventKey)) {
                acc.openEventIds.add(eventKey);
                acc.openCount += 1;
              }
            }
            if (severityLevel !== null) {
              acc.eventSeverities.set(eventKey, severityLevel);
            }
            if (includeAlertDetails && !acc.alertDetailIds.has(eventKey)) {
              acc.alertDetailIds.add(eventKey);
              acc.alertDetails.push({
                eventId: eventKey,
                name: problem.name,
                severity: severityLevel ?? 0,
                openedAt: new Date(problemStart * 1000).toISOString(),
                closedAt,
                firstAckAt,
                secondAckAt,
                detectionMinutes: detectionMinutesDetail,
                responseMinutes: responseMinutesDetail,
                resolutionMinutes: durationMinutes,
                hosts: problemHostNames,
                isOpen,
              });
            }
          }
          if (qualifiesForImpact && eventKey) {
            acc.impactIncidentIds.add(eventKey);
          }
          if (severityLevel !== null && shouldCountAlert) {
            acc.severityCounter[severityLevel] =
              (acc.severityCounter[severityLevel] ?? 0) + 1;
          }
          if (hasOverlap) {
            if (eventKey && hostIsActive) {
              const alertImpact = acc.alertImpact.get(eventKey) ?? {
                eventId: eventKey,
                name: problem.name,
                severity: severityLevel ?? 0,
                openedAt,
                closedAt: closedAtActual,
                total: 0,
                business: 0,
                hostNames: new Set<string>(),
                triggerId,
              };
              alertImpact.total += durationSeconds;
              alertImpact.business += shiftDurations.business;
              if (host.name) {
                alertImpact.hostNames.add(host.name);
              }
              acc.alertImpact.set(eventKey, alertImpact);
            }
            if (detectionDelta !== null) {
              acc.detection.push(detectionDelta);
            }
            if (responseDelta !== null) {
              acc.response.push(responseDelta);
            }
            if (resolutionDeltaForMetrics !== null) {
              acc.resolution.push(resolutionDeltaForMetrics);
            }
          }
          groupAccumulators.set(group.groupid, acc);
        }
      }

      if (severityLevel === 5 && shouldCountAlert) {
        if (host.hostid) {
          highlightHostIds.push(host.hostid);
        }
        if (host.name) {
          highlightHostNames.push(host.name);
        }
        const memberships = hostGroupMap.get(host.hostid) ?? [];
        for (const group of memberships) {
          if (group.groupid) {
            highlightGroupMap.set(group.groupid, group.name);
          }
        }
      }
    }

    const classification = detectFalseClassification(problem);
    if (shouldCountAlert) {
      if (classification === "fp") falsePositives += 1;
      if (classification === "fn") falseNegatives += 1;
    }

    if (severityLevel === 5 && shouldCountAlert) {
      criticalAlerts.push({
        eventId: String(problem.eventid),
        name: problem.name,
        severity: severityLevel,
        hostIds: highlightHostIds,
        hostNames: highlightHostNames,
        groupIds: Array.from(highlightGroupMap.keys()),
        groupNames: Array.from(highlightGroupMap.values()),
        openedAt: new Date(problemStart * 1000).toISOString(),
        closedAt,
        isOpen,
        detectionMinutes: detectionMinutesDetail,
        responseMinutes: responseMinutesDetail,
        businessMinutes: secondsToMinutes(shiftDurations.business),
        resolutionMinutes: durationMinutes,
      });
    }
  }

  hostDowntime = buildHostDowntime(hostIntervals);
  reachabilityHostDowntime = buildHostDowntime(reachabilityIntervals);

  if (groupAccumulators) {
    for (const acc of groupAccumulators.values()) {
      acc.downtimeTotal = 0;
      acc.downtimeBusiness = 0;
      acc.reachabilityDowntimeTotal = 0;
      acc.reachabilityDowntimeBusiness = 0;
      acc.hostDowntime = new Map<string, HostImpactAccumulator>();
      acc.reachabilityHostDowntime = new Map<string, HostImpactAccumulator>();
      for (const hostId of acc.activeHostIds) {
        const downtime = hostDowntime.get(hostId) ?? {
          total: 0,
          business: 0,
          off: 0,
        };
        const reachability = reachabilityHostDowntime.get(hostId) ?? {
          total: 0,
          business: 0,
          off: 0,
        };
        acc.downtimeTotal += downtime.total;
        acc.downtimeBusiness += downtime.business;
        acc.reachabilityDowntimeTotal += reachability.total;
        acc.reachabilityDowntimeBusiness += reachability.business;
        acc.hostDowntime.set(hostId, {
          hostid: hostId,
          name: hostNameMap.get(hostId) ?? hostId,
          total: downtime.total,
          business: downtime.business,
          off: downtime.off,
        });
        acc.reachabilityHostDowntime.set(hostId, {
          hostid: hostId,
          name: hostNameMap.get(hostId) ?? hostId,
          total: reachability.total,
          business: reachability.business,
          off: reachability.off,
        });
      }
    }
  }

  const triggerTypeMapForInsights = includeAvailabilityInsights
    ? triggerTypeMap
    : new Map<string, TriggerTypeInfo>();

  const totalProblems = problems.length;
  const truePositives = Math.max(
    totalProblems - (falsePositives + falseNegatives),
    0
  );

  const hostCount = activeHosts;
  const hostFactor = hostCount || 1;
  const totalRangeSeconds = endSeconds - startSeconds;
  const totalHostSeconds = totalRangeSeconds * hostFactor;
  const totalDowntimeSeconds = sumDowntimeForHosts(
    hostDowntime,
    activeHostIds,
    "total"
  );
  const reachabilityDowntimeSeconds = sumDowntimeForHosts(
    reachabilityHostDowntime,
    activeHostIds,
    "total"
  );
  const rangeShiftSplit = splitSecondsByShift(startSeconds, endSeconds);
  const totalBusinessSeconds = rangeShiftSplit.business;
  const totalOffSeconds = rangeShiftSplit.off;
  const businessWindowLabel = formatBusinessWindowLabel();

  const businessDowntime = sumDowntimeForHosts(
    hostDowntime,
    activeHostIds,
    "business"
  );
  const reachabilityBusinessDowntime = sumDowntimeForHosts(
    reachabilityHostDowntime,
    activeHostIds,
    "business"
  );

  const offDowntime = sumDowntimeForHosts(
    hostDowntime,
    activeHostIds,
    "off"
  );
  const reachabilityOffDowntime = sumDowntimeForHosts(
    reachabilityHostDowntime,
    activeHostIds,
    "off"
  );

  const detectionMinutes = secondsToMinutes(safeAverage(detectionDurations));
  const responseMinutes = secondsToMinutes(safeAverage(responseDurations));
  const resolutionMinutes = secondsToMinutes(safeAverage(resolutionDurations));

  const overallAvailability =
    totalHostSeconds > 0
      ? ((totalHostSeconds - totalDowntimeSeconds) / totalHostSeconds) * 100
      : 100;

  const businessAvailability =
    totalBusinessSeconds > 0
      ? ((totalBusinessSeconds * hostFactor - businessDowntime) /
          (totalBusinessSeconds * hostFactor)) *
        100
      : 100;

  const offHoursAvailability =
    totalOffSeconds > 0
      ? ((totalOffSeconds * hostFactor - offDowntime) /
          (totalOffSeconds * hostFactor)) *
        100
      : 100;

  const reachabilityAvailability =
    totalHostSeconds > 0
      ? ((totalHostSeconds - reachabilityDowntimeSeconds) /
          totalHostSeconds) *
        100
      : 100;

  const reachabilityBusinessAvailability =
    totalBusinessSeconds > 0
      ? ((totalBusinessSeconds * hostFactor - reachabilityBusinessDowntime) /
          (totalBusinessSeconds * hostFactor)) *
        100
      : 100;

  const reachabilityOffHoursAvailability =
    totalOffSeconds > 0
      ? ((totalOffSeconds * hostFactor - reachabilityOffDowntime) /
          (totalOffSeconds * hostFactor)) *
        100
      : 100;

  const categories = buildHostCategoryStats({
    hosts: activeHostList,
    hostDowntime,
    totalRangeSeconds,
  });
  const hostMetrics = buildHostMetrics({
    hostNameMap,
    hostDowntime,
    reachabilityHostDowntime,
    hostDurationSamples,
    hostEventCount,
    hostOpenCount,
    totalRangeSeconds,
    businessSeconds: totalBusinessSeconds,
  });
  const summaryTotals = {
    alerts: Array.from(hostEventCount.values()).reduce(
      (acc, count) => acc + count,
      0
    ),
    openAlerts: Array.from(hostOpenCount.values()).reduce(
      (acc, count) => acc + count,
      0
    ),
    impactIncidents,
    inactiveHosts: inactiveHostCount,
  };

  const selectedGroup = hostGroups.find(
    (group) => group.groupid === input.groupId
  );

  const groupSummaries = groupAccumulators
    ? buildGroupSummaries({
        accumulators: groupAccumulators,
        totalRangeSeconds,
        businessSeconds: totalBusinessSeconds,
        includeAlertDetails,
        includeAvailabilityInsights,
        triggerTypeMap: triggerTypeMapForInsights,
        businessWindowLabel,
      })
    : undefined;

  const severitySummary = SEVERITY_LEVELS.map((level) => ({
    severity: level.key,
    label: level.label,
    count: severityTotals[level.key] ?? 0,
  }));

  return {
    kpis: {
      detectionMinutes,
      responseMinutes,
      resolutionMinutes,
      availabilityPct: overallAvailability,
      reachabilityPct: reachabilityAvailability,
    },
    availability: {
      businessPct: businessAvailability,
      offHoursPct: offHoursAvailability,
      overallPct: overallAvailability,
    },
    reachability: {
      businessPct: reachabilityBusinessAvailability,
      offHoursPct: reachabilityOffHoursAvailability,
      overallPct: reachabilityAvailability,
    },
    hostCategories: categories,
    severitySummary,
    hosts: hostMetrics,
    accuracy: {
      falsePositivePct: percentage(falsePositives, totalProblems),
      falseNegativePct: percentage(falseNegatives, totalProblems),
      precisionPct: percentage(truePositives, totalProblems),
    },
    totals: {
      hosts: activeHosts,
      coveragePct: 100,
      slaPct: overallAvailability,
    },
    groupTotals: {
      ...summaryTotals,
      hostCount: activeHosts,
      inactiveHosts: inactiveHostCount,
    },
    groupSummaries,
    criticalAlerts,
    meta: {
      period: label,
      groupId: input.groupId,
      groupName: selectedGroup?.name,
      generatedAt: new Date().toISOString(),
    },
  };
}

function percentage(value: number, total: number): number {
  if (!total) return 0;
  return (value / total) * 100;
}

function buildHostMetrics({
  hostNameMap,
  hostDowntime,
  reachabilityHostDowntime,
  hostDurationSamples,
  hostEventCount,
  hostOpenCount,
  totalRangeSeconds,
  businessSeconds,
}: {
  hostNameMap: Map<string, string>;
  hostDowntime: Map<
    string,
    { total: number; business: number; off: number }
  >;
  reachabilityHostDowntime: Map<
    string,
    { total: number; business: number; off: number }
  >;
  hostDurationSamples: Map<
    string,
    { detection: number[]; response: number[]; resolution: number[] }
  >;
  hostEventCount: Map<string, number>;
  hostOpenCount: Map<string, number>;
  totalRangeSeconds: number;
  businessSeconds: number;
}): HostMetric[] {
  return Array.from(hostNameMap.entries())
    .map(([hostid, name]) => {
      const downtime = hostDowntime.get(hostid);
      const reachability = reachabilityHostDowntime.get(hostid);
      const durations = hostDurationSamples.get(hostid);
      const detectionMinutes = secondsToMinutes(
        safeAverage(durations?.detection ?? [])
      );
      const responseMinutes = secondsToMinutes(
        safeAverage(durations?.response ?? [])
      );
      const resolutionMinutes = secondsToMinutes(
        safeAverage(durations?.resolution ?? [])
      );
      const availabilityPct =
        totalRangeSeconds > 0
          ? ((totalRangeSeconds - (downtime?.total ?? 0)) /
              totalRangeSeconds) *
            100
          : 100;
      const businessAvailabilityPct =
        businessSeconds > 0
          ? ((businessSeconds - (downtime?.business ?? 0)) / businessSeconds) *
            100
          : 100;
      const reachabilityPct =
        totalRangeSeconds > 0
          ? ((totalRangeSeconds - (reachability?.total ?? 0)) /
              totalRangeSeconds) *
            100
          : 100;
      const businessReachabilityPct =
        businessSeconds > 0
          ? ((businessSeconds - (reachability?.business ?? 0)) /
              businessSeconds) *
            100
          : 100;

      return {
        hostid,
        name,
        detectionMinutes,
        responseMinutes,
        resolutionMinutes,
        availabilityPct,
        businessAvailabilityPct,
        reachabilityPct,
        businessReachabilityPct,
        eventCount: hostEventCount.get(hostid) ?? 0,
        openEventCount: hostOpenCount.get(hostid) ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

type GroupAccumulator = {
  group: ZabbixHostGroup;
  hostIds: Set<string>;
  activeHosts: number;
  inactiveHosts: number;
  activeHostIds: Set<string>;
  inactiveHostIds: Set<string>;
  severityCounter: SeverityCounter;
  detection: number[];
  response: number[];
  resolution: number[];
  downtimeTotal: number;
  downtimeBusiness: number;
  reachabilityDowntimeTotal: number;
  reachabilityDowntimeBusiness: number;
  hostDowntime: Map<string, HostImpactAccumulator>;
  reachabilityHostDowntime: Map<string, HostImpactAccumulator>;
  eventCount: number;
  openCount: number;
  eventIds: Set<string>;
  openEventIds: Set<string>;
  eventSeverities: Map<string, number>;
  impactIncidentIds: Set<string>;
  alertImpact: Map<string, AlertImpactAccumulator>;
  alertDetails: GroupAlertDetail[];
  alertDetailIds: Set<string>;
};

type HostImpactAccumulator = {
  hostid: string;
  name: string;
  total: number;
  business: number;
  off: number;
};

type AlertImpactAccumulator = {
  eventId: string;
  name: string;
  severity: number;
  openedAt: string;
  closedAt: string | null;
  total: number;
  business: number;
  hostNames: Set<string>;
  triggerId?: string;
};

type TriggerTypeInfo = {
  alertType: string;
  itemKeys: string[];
};

function createGroupAccumulator(group: ZabbixHostGroup): GroupAccumulator {
  return {
    group,
    hostIds: new Set<string>(),
    activeHosts: 0,
    inactiveHosts: 0,
    activeHostIds: new Set<string>(),
    inactiveHostIds: new Set<string>(),
    severityCounter: createSeverityCounter(),
    detection: [],
    response: [],
    resolution: [],
    downtimeTotal: 0,
    downtimeBusiness: 0,
    reachabilityDowntimeTotal: 0,
    reachabilityDowntimeBusiness: 0,
    hostDowntime: new Map<string, HostImpactAccumulator>(),
    reachabilityHostDowntime: new Map<string, HostImpactAccumulator>(),
    eventCount: 0,
    openCount: 0,
    eventIds: new Set<string>(),
    openEventIds: new Set<string>(),
    eventSeverities: new Map<string, number>(),
    impactIncidentIds: new Set<string>(),
    alertImpact: new Map<string, AlertImpactAccumulator>(),
    alertDetails: [],
    alertDetailIds: new Set<string>(),
  };
}

function buildGroupSummaries({
  accumulators,
  totalRangeSeconds,
  businessSeconds,
  includeAlertDetails,
  includeAvailabilityInsights,
  triggerTypeMap,
  businessWindowLabel,
}: {
  accumulators: Map<string, GroupAccumulator>;
  totalRangeSeconds: number;
  businessSeconds: number;
  includeAlertDetails?: boolean;
  includeAvailabilityInsights?: boolean;
  triggerTypeMap?: Map<string, TriggerTypeInfo>;
  businessWindowLabel: string;
}): HostGroupMetric[] {
  return Array.from(accumulators.values())
    .filter((acc) => acc.hostIds.size > 0)
    .map((acc) => {
      const activeHostCount = acc.activeHosts;
      const totalHostSeconds = totalRangeSeconds * activeHostCount;
      const totalBusinessSeconds = businessSeconds * activeHostCount;
      const availabilityPct =
        totalHostSeconds > 0
          ? ((totalHostSeconds - acc.downtimeTotal) / totalHostSeconds) * 100
          : 100;
      const businessAvailabilityPct =
        totalBusinessSeconds > 0
          ? ((totalBusinessSeconds - acc.downtimeBusiness) /
              totalBusinessSeconds) *
            100
          : 100;
      const reachabilityPct =
        totalHostSeconds > 0
          ? ((totalHostSeconds - acc.reachabilityDowntimeTotal) /
              totalHostSeconds) *
            100
          : 100;
      const businessReachabilityPct =
        totalBusinessSeconds > 0
          ? ((totalBusinessSeconds - acc.reachabilityDowntimeBusiness) /
              totalBusinessSeconds) *
            100
          : 100;
      const triggerMap = triggerTypeMap ?? new Map<string, TriggerTypeInfo>();
      const availabilityInsights = includeAvailabilityInsights
        ? buildAvailabilityInsights({
            hostDowntime: acc.hostDowntime,
            alertImpact: acc.alertImpact,
            groupDowntimeSeconds: acc.downtimeBusiness,
            windowSeconds: businessSeconds,
            windowType: "business",
            windowLabel: businessWindowLabel,
            triggerTypeMap: triggerMap,
          })
        : undefined;
      const reachabilityInsights = includeAvailabilityInsights
        ? buildAvailabilityInsights({
            hostDowntime: acc.reachabilityHostDowntime,
            alertImpact: acc.alertImpact,
            groupDowntimeSeconds: acc.reachabilityDowntimeBusiness,
            windowSeconds: businessSeconds,
            windowType: "business",
            windowLabel: businessWindowLabel,
            triggerTypeMap: triggerMap,
            filterAlertType: (info) => isReachabilityAlertType(info.alertType),
          })
        : undefined;
      const reachabilityOverallInsights = includeAvailabilityInsights
        ? buildAvailabilityInsights({
            hostDowntime: acc.reachabilityHostDowntime,
            alertImpact: acc.alertImpact,
            groupDowntimeSeconds: acc.reachabilityDowntimeTotal,
            windowSeconds: totalRangeSeconds,
            windowType: "overall",
            windowLabel: "Periodo completo",
            triggerTypeMap: triggerMap,
            filterAlertType: (info) => isReachabilityAlertType(info.alertType),
          })
        : undefined;

      return {
        groupid: acc.group.groupid,
        name: acc.group.name,
        hosts: activeHostCount,
        inactiveHosts: acc.inactiveHosts,
        impactIncidents: acc.impactIncidentIds.size,
        hostIds: Array.from(acc.activeHostIds),
        inactiveHostIds: Array.from(acc.inactiveHostIds),
        severitySummary: SEVERITY_LEVELS.map((level) => ({
          severity: level.key,
          label: level.label,
          count: acc.severityCounter[level.key] ?? 0,
        })),
        alerts: acc.eventIds.size,
        openAlerts: acc.openEventIds.size,
        eventIds: Array.from(acc.eventIds),
        openEventIds: Array.from(acc.openEventIds),
        impactIncidentIds: Array.from(acc.impactIncidentIds),
        eventSeverities: Array.from(acc.eventSeverities.entries()).map(
          ([eventId, severity]) => ({
            eventId,
            severity,
          })
        ),
        detectionMinutes: secondsToMinutes(safeAverage(acc.detection)),
        responseMinutes: secondsToMinutes(safeAverage(acc.response)),
        resolutionMinutes: secondsToMinutes(safeAverage(acc.resolution)),
        availabilityPct,
        businessAvailabilityPct,
        reachabilityPct,
        businessReachabilityPct,
        ...(includeAlertDetails ? { alertDetails: acc.alertDetails } : {}),
        ...(availabilityInsights ? { availabilityInsights } : {}),
        ...(reachabilityInsights ? { reachabilityInsights } : {}),
        ...(reachabilityOverallInsights ? { reachabilityOverallInsights } : {}),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function buildHostCategoryStats({
  hosts,
  hostDowntime,
  totalRangeSeconds,
}: {
  hosts: ZabbixHost[];
  hostDowntime: Map<string, { total: number; business: number; off: number }>;
  totalRangeSeconds: number;
}): HostCategoryStat[] {
  const totals: Record<
    string,
    { category: HostCategory; count: number; hostIds: string[] }
  > = {};

  for (const host of hosts) {
    const category = classifyHost(host);
    const entry = totals[category.id] ?? {
      category,
      count: 0,
      hostIds: [],
    };
    entry.count += 1;
    entry.hostIds.push(host.hostid);
    totals[category.id] = entry;
  }

  const allCategories = [...HOST_CATEGORIES, DEFAULT_CATEGORY];
  const totalHosts = hosts.length;
  const coverageDenominator = totalHosts || 1;

  return allCategories.map((category) => {
    const bucket = totals[category.id] ?? {
      category,
      count: 0,
      hostIds: [],
    };
    const downtime = bucket.hostIds.reduce((acc, hostId) => {
      const entry = hostDowntime.get(hostId);
      return acc + (entry?.total ?? 0);
    }, 0);
    const hostSeconds = totalRangeSeconds * bucket.count;
    const sla =
      bucket.count > 0 && hostSeconds > 0
        ? ((hostSeconds - downtime) / hostSeconds) * 100
        : 100;

    return {
      id: category.id,
      label: category.label,
      count: bucket.count,
      coveragePct: (bucket.count / coverageDenominator) * 100,
      slaPct: sla,
    };
  });
}

const MAX_INSIGHT_ITEMS = 5;

function buildHostDowntime(
  hostIntervals: Map<string, Interval[]>
): Map<string, { total: number; business: number; off: number }> {
  const downtime = new Map<string, { total: number; business: number; off: number }>();
  for (const [hostId, intervals] of hostIntervals.entries()) {
    if (!intervals.length) {
      downtime.set(hostId, { total: 0, business: 0, off: 0 });
      continue;
    }
    const merged = mergeIntervals(intervals);
    let total = 0;
    let business = 0;
    let off = 0;
    for (const interval of merged) {
      const duration = Math.max(0, interval.end - interval.start);
      if (!duration) continue;
      total += duration;
      const split = splitSecondsByShift(interval.start, interval.end);
      business += split.business;
      off += split.off;
    }
    downtime.set(hostId, { total, business, off });
  }
  return downtime;
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    if (!merged.length) {
      merged.push({ ...interval });
      continue;
    }
    const last = merged[merged.length - 1];
    if (interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

function buildAvailabilityInsights({
  hostDowntime,
  alertImpact,
  groupDowntimeSeconds,
  windowSeconds,
  windowType,
  windowLabel,
  triggerTypeMap,
  filterAlertType,
}: {
  hostDowntime: Map<string, HostImpactAccumulator>;
  alertImpact: Map<string, AlertImpactAccumulator>;
  groupDowntimeSeconds: number;
  windowSeconds: number;
  windowType: "business" | "overall";
  windowLabel: string;
  triggerTypeMap: Map<string, TriggerTypeInfo>;
  filterAlertType?: (info: TriggerTypeInfo) => boolean;
}): AvailabilityInsights {
  const windowKey: "business" | "total" =
    windowType === "business" ? "business" : "total";
  const groupDowntimeMinutes = secondsToMinutes(groupDowntimeSeconds);

  const topHosts: AvailabilityHostImpact[] = Array.from(
    hostDowntime.values()
  )
    .filter((entry) => entry[windowKey] > 0)
    .sort((a, b) => b[windowKey] - a[windowKey])
    .slice(0, MAX_INSIGHT_ITEMS)
    .map((entry) => ({
      hostid: entry.hostid,
      name: entry.name,
      windowDowntimeMinutes: secondsToMinutes(entry[windowKey]),
      totalDowntimeMinutes: secondsToMinutes(entry.total),
      windowAvailabilityPct:
        windowSeconds > 0
          ? ((windowSeconds - entry[windowKey]) / windowSeconds) * 100
          : 100,
      shareOfGroupWindowDowntimePct: groupDowntimeSeconds
        ? (entry[windowKey] / groupDowntimeSeconds) * 100
        : 0,
    }));

  const topAlerts: AvailabilityAlertImpact[] = Array.from(
    alertImpact.values()
  )
    .filter((entry) => entry[windowKey] > 0)
    .sort((a, b) => b[windowKey] - a[windowKey])
    .map((entry) => {
      const fallback = deriveAlertType([], entry.name);
      const triggerInfo = entry.triggerId
        ? triggerTypeMap.get(entry.triggerId)
        : null;
      const info = triggerInfo ?? fallback;
      if (filterAlertType && !filterAlertType(info)) {
        return null;
      }
      const hostNames = Array.from(entry.hostNames).sort((a, b) =>
        a.localeCompare(b, "pt-BR")
      );
      const itemKeys = [...info.itemKeys].sort((a, b) =>
        a.localeCompare(b)
      );
      return {
        eventId: entry.eventId,
        triggerId: entry.triggerId,
        name: entry.name,
        severity: entry.severity,
        openedAt: entry.openedAt,
        closedAt: entry.closedAt,
        windowDowntimeMinutes: secondsToMinutes(entry[windowKey]),
        totalDowntimeMinutes: secondsToMinutes(entry.total),
        shareOfGroupWindowDowntimePct: groupDowntimeSeconds
          ? (entry[windowKey] / groupDowntimeSeconds) * 100
          : 0,
        hostNames,
        alertType: info.alertType,
        itemKeys,
      };
    })
    .filter(
      (entry): entry is AvailabilityAlertImpact => entry !== null
    )
    .slice(0, MAX_INSIGHT_ITEMS);

  return {
    windowType,
    windowLabel,
    groupDowntimeMinutes,
    topHosts,
    topAlerts,
  };
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
    map.set(
      trigger.triggerid,
      deriveAlertType(trigger.items ?? [], text)
    );
  }
  return map;
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

function formatBusinessWindowLabel(): string {
  const startLabel = `${BUSINESS_START_HOUR}h`;
  const endLabel = BUSINESS_END_HOUR >= 24 ? "23:59" : `${BUSINESS_END_HOUR}h`;
  return `${startLabel}-${endLabel} (${DEFAULT_TIMEZONE})`;
}
