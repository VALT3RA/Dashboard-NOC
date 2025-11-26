import "server-only";

import {
  fetchCurrentProblems,
  fetchHosts,
  fetchHostsByIds,
  ZabbixHost,
  ZabbixProblem,
} from "@/lib/zabbix";
import { OpenProblemDetail, OpenProblemsResponse } from "@/types/dashboard";
import { SEVERITY_LEVELS } from "@/lib/metrics";

const severityLabelMap = new Map(
  SEVERITY_LEVELS.map((level) => [level.key, level.label])
);

export async function listOpenProblems(): Promise<OpenProblemsResponse> {
  const nowSeconds = Math.floor(Date.now() / 1000);

  const [hosts, problems] = await Promise.all([
    fetchHosts(),
    fetchCurrentProblems(),
  ]);

  const hostMap = new Map<string, ZabbixHost>();
  hosts.forEach((host) => hostMap.set(host.hostid, host));

  const problemHostIds = new Set<string>();
  for (const problem of problems) {
    for (const host of problem.hosts ?? []) {
      if (host.hostid) {
        problemHostIds.add(host.hostid);
      }
    }
  }

  const missingHostIds = Array.from(problemHostIds).filter(
    (hostId) => hostId && !hostMap.has(hostId)
  );

  if (missingHostIds.length) {
    const fallbackHosts = await fetchHostsByIds(missingHostIds);
    fallbackHosts.forEach((host) => hostMap.set(host.hostid, host));
  }

  const mapped = problems
    .filter((problem) => !problem.r_eventid || problem.r_eventid === "0")
    .map((problem) => mapProblem(problem, hostMap, nowSeconds));

  mapped.sort((a, b) => {
    if (b.severity !== a.severity) {
      return b.severity - a.severity;
    }
    return (
      new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime()
    );
  });

  return {
    problems: mapped,
    total: mapped.length,
    generatedAt: new Date().toISOString(),
  };
}

function mapProblem(
  problem: ZabbixProblem,
  hostMap: Map<string, ZabbixHost>,
  nowSeconds: number
): OpenProblemDetail {
  const startSeconds = Number(problem.clock);
  const acknowledges = [...(problem.acknowledges ?? [])].sort(
    (a, b) => Number(a.clock) - Number(b.clock)
  );
  const detectionDelta =
    acknowledges.length > 0
      ? Math.max(0, Number(acknowledges[0].clock) - startSeconds)
      : null;
  const responseDelta =
    acknowledges.length > 1
      ? Math.max(0, Number(acknowledges[1].clock) - startSeconds)
      : detectionDelta;

  const severity = Number(problem.severity ?? 0);
  const severityLabel =
    severityLabelMap.get(severity) ?? `Severidade ${severity}`;

  const hostInfos = (problem.hosts ?? []).map((host) => ({
    hostid: host.hostid,
    name: host.name,
  }));

  const groupSet = new Set<string>();
  for (const host of problem.hosts ?? []) {
    const detail = hostMap.get(host.hostid);
    detail?.groups?.forEach((group) => groupSet.add(group.name));
  }

  const durationMinutes = secondsToMinutes(
    Math.max(0, nowSeconds - startSeconds)
  );

  return {
    eventId: problem.eventid,
    name: problem.name,
    severity,
    severityLabel,
    openedAt: new Date(startSeconds * 1000).toISOString(),
    durationMinutes,
    detectionMinutes:
      detectionDelta !== null ? secondsToMinutes(detectionDelta) : null,
    responseMinutes:
      responseDelta !== null ? secondsToMinutes(responseDelta ?? 0) : null,
    hosts: hostInfos,
    groupNames: Array.from(groupSet),
    tags: problem.tags ?? [],
  };
}

function secondsToMinutes(value: number): number {
  if (!value || Number.isNaN(value)) return 0;
  return value / 60;
}
