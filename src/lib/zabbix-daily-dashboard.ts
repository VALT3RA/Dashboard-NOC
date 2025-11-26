import { formatInTimeZone } from "date-fns-tz";

import {
  fetchProblems,
  fetchProblemsByIds,
  fetchRecoveryEvents,
  fetchResolvedEventsInRange,
  ZabbixProblem,
  ZabbixEvent,
} from "@/lib/zabbix";

const DASHBOARD_TIMEZONE = process.env.DASHBOARD_TIMEZONE ?? "America/Sao_Paulo";

export type ZabbixDailyDashboardMetrics = {
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  openCount: number;
  resolvedCount: number;
  detectionAvgMinutes: number;
  resolutionAvgMinutes: number;
};

export async function buildDailyZabbixDashboardMetrics(
  referenceDate = new Date()
): Promise<ZabbixDailyDashboardMetrics> {
  const { periodStart, periodEnd } = getPeriodBounds(referenceDate);

  const startSeconds = Math.floor(periodStart.getTime() / 1000);
  const endSeconds = Math.floor(periodEnd.getTime() / 1000);

  const [problemsOpenedToday, resolvedEvents] = await Promise.all([
    fetchProblems({
      timeFrom: startSeconds,
      timeTill: endSeconds,
    }),
    fetchResolvedEventsInRange({
      timeFrom: startSeconds,
      timeTill: endSeconds,
    }),
  ]);

  const recoveryIds = problemsOpenedToday
    .map((problem) => problem.r_eventid)
    .filter((id): id is string => Boolean(id && id !== "0"));
  const recoveryMap = await fetchRecoveryEvents(recoveryIds);

  const alerts = problemsOpenedToday.map((problem) =>
    mapProblem(problem, recoveryMap, endSeconds)
  );

  const openAlerts = alerts.filter((alert) => alert.closedAt === null);

  const resolvedProblemIds = resolvedEvents
    .map((event) => event.r_eventid)
    .filter((id): id is string => Boolean(id && id !== "0"));

  const resolvedProblems = await fetchProblemsByIds(resolvedProblemIds);
  const resolvedRecoveryMap = resolvedEvents.reduce<Record<string, ZabbixEvent>>(
    (acc, event) => {
      acc[event.eventid] = event;
      return acc;
    },
    {}
  );

  const resolvedAlerts = resolvedProblems
    .filter(
      (problem) =>
        Boolean(problem.r_eventid) && resolvedRecoveryMap[problem.r_eventid!]
    )
    .map((problem) => mapProblem(problem, resolvedRecoveryMap, endSeconds));

  const detectionAvgMinutes = average(
    resolvedAlerts
      .map((alert) => alert.detectionMinutes)
      .filter((value): value is number => typeof value === "number")
  );
  const resolutionAvgMinutes = average(
    resolvedAlerts.map((alert) => alert.resolutionMinutes)
  );

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    generatedAt: new Date().toISOString(),
    openCount: openAlerts.length,
    resolvedCount: resolvedAlerts.length,
    detectionAvgMinutes,
    resolutionAvgMinutes,
  };
}

type AlertMetric = {
  eventId: string;
  openedAt: string;
  closedAt: string | null;
  detectionMinutes: number | null;
  resolutionMinutes: number;
};

function mapProblem(
  problem: ZabbixProblem,
  recoveryMap: Record<string, { clock: string }>,
  periodEndSeconds: number
): AlertMetric {
  const startSeconds = Number(problem.clock);
  const recoverySeconds = problem.r_eventid
    ? Number(recoveryMap[problem.r_eventid]?.clock)
    : null;
  const endSeconds =
    recoverySeconds && recoverySeconds > 0
      ? Math.min(recoverySeconds, periodEndSeconds)
      : periodEndSeconds;
  const durationSeconds = Math.max(0, endSeconds - startSeconds);
  const acknowledges = [...(problem.acknowledges ?? [])].sort(
    (a, b) => Number(a.clock) - Number(b.clock)
  );
  const detectionDelta =
    acknowledges.length > 0
      ? Math.max(0, Number(acknowledges[0].clock) - startSeconds)
      : null;

  return {
    eventId: String(problem.eventid),
    openedAt: new Date(startSeconds * 1000).toISOString(),
    closedAt:
      recoverySeconds && recoverySeconds > 0
        ? new Date(recoverySeconds * 1000).toISOString()
        : null,
    detectionMinutes:
      detectionDelta !== null ? secondsToMinutes(detectionDelta) : null,
    resolutionMinutes: secondsToMinutes(durationSeconds),
  };
}

function secondsToMinutes(value: number): number {
  if (!value || Number.isNaN(value)) return 0;
  return value / 60;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  const sum = values.reduce((total, entry) => total + entry, 0);
  return sum / values.length;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function getPeriodBounds(referenceDate: Date) {
  const localDateLabel = formatInTimeZone(
    referenceDate,
    DASHBOARD_TIMEZONE,
    "yyyy-MM-dd"
  );
  const offsetLabel = formatInTimeZone(referenceDate, DASHBOARD_TIMEZONE, "xxx");
  const [year, month, day] = localDateLabel.split("-").map(Number);
  const offsetMinutes = parseOffsetMinutes(offsetLabel);

  const startUtcMs =
    Date.UTC(year, month - 1, day, 0, 0) - offsetMinutes * 60 * 1000;
  const periodStart = new Date(startUtcMs);
  const maxPeriodEnd = new Date(startUtcMs + DAY_MS);
  const periodEnd =
    referenceDate.getTime() < maxPeriodEnd.getTime()
      ? referenceDate
      : maxPeriodEnd;
  return { periodStart, periodEnd };
}

function parseOffsetMinutes(offset: string): number {
  const sign = offset.startsWith("-") ? -1 : 1;
  const normalized = offset.replace("+", "").replace("-", "");
  const [hours, minutes] = normalized.split(":").map(Number);
  return sign * (hours * 60 + minutes);
}
