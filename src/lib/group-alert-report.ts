import "server-only";

import {
  fetchHostGroups,
  fetchHosts,
  fetchProblems,
  fetchRecoveryEvents,
  ZabbixProblem,
} from "@/lib/zabbix";
import { GroupAlertRecord } from "@/types/dashboard";
import { SEVERITY_LEVELS } from "@/lib/metrics";

const severityLabelMap = new Map(
  SEVERITY_LEVELS.map((level) => [level.key, level.label])
);

export async function buildGroupAlertReport({
  groupName,
  start,
  end,
}: {
  groupName: string;
  start: Date;
  end: Date;
}): Promise<{ groupId: string; groupLabel: string; alerts: GroupAlertRecord[] }> {
  const groups = await fetchHostGroups();
  const normalized = groupName.trim().toLowerCase();
  const group = groups.find(
    (entry) => entry.name.trim().toLowerCase() === normalized
  );
  if (!group) {
    throw new Error(`Host group "${groupName}" não encontrado no Zabbix.`);
  }

  const startSeconds = Math.floor(start.getTime() / 1000);
  const endSeconds = Math.floor(end.getTime() / 1000);

  const [hosts, problems] = await Promise.all([
    fetchHosts(group.groupid),
    fetchProblems({
      groupId: group.groupid,
      timeFrom: startSeconds,
      timeTill: endSeconds,
    }),
  ]);

  const hostStatusMap = new Map<string, boolean>();
  hosts.forEach((host) => {
    const isActive =
      host.status === undefined || host.status === "0" || host.status === 0;
    hostStatusMap.set(host.hostid, isActive);
  });

  const recoveryMap = await fetchRecoveryEvents(
    problems
      .map((problem) => problem.r_eventid)
      .filter((id): id is string => Boolean(id && id !== "0"))
  );

  const alerts = problems.map((problem) =>
    mapProblem(problem, recoveryMap, endSeconds, hostStatusMap)
  );

  alerts.sort(
    (a, b) =>
      new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime()
  );

  return {
    groupId: group.groupid,
    groupLabel: group.name,
    alerts,
  };
}

function mapProblem(
  problem: ZabbixProblem,
  recoveryMap: Record<string, { clock: string }>,
  periodEndSeconds: number,
  hostStatusMap: Map<string, boolean>
): GroupAlertRecord {
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
  const firstAckSeconds =
    acknowledges.length > 0 ? Number(acknowledges[0].clock) : null;
  const responseDelta =
    acknowledges.length > 1
      ? Math.max(0, Number(acknowledges[1].clock) - startSeconds)
      : detectionDelta;
  const secondAckSeconds =
    acknowledges.length > 1
      ? Number(acknowledges[1].clock)
      : acknowledges.length === 1
        ? Number(acknowledges[0].clock)
        : null;
  const resolutionDelta = durationSeconds;

  const severity = Number(problem.severity ?? 0);
  const severityLabel =
    severityLabelMap.get(severity) ?? `Severidade ${severity}`;

  return {
    eventId: String(problem.eventid),
    name: problem.name,
    severity,
    severityLabel,
    hosts: (problem.hosts ?? []).map((host) => ({
      hostid: host.hostid,
      name: host.name,
      isActive: hostStatusMap.get(host.hostid ?? "") ?? true,
    })),
    openedAt: new Date(startSeconds * 1000).toISOString(),
    closedAt:
      recoverySeconds && recoverySeconds > 0
        ? new Date(recoverySeconds * 1000).toISOString()
        : null,
    detectionMinutes:
      detectionDelta !== null ? secondsToMinutes(detectionDelta) : null,
    responseMinutes:
      responseDelta !== null ? secondsToMinutes(responseDelta) : null,
    resolutionMinutes: secondsToMinutes(resolutionDelta),
    openDurationMinutes: secondsToMinutes(durationSeconds),
    ticketOpened: secondsToMinutes(durationSeconds) >= 5,
    firstAckAt: firstAckSeconds
      ? new Date(firstAckSeconds * 1000).toISOString()
      : null,
    secondAckAt: secondAckSeconds
      ? new Date(secondAckSeconds * 1000).toISOString()
      : null,
    secondAckMinutes:
      responseDelta !== null ? secondsToMinutes(responseDelta) : null,
  };
}

function secondsToMinutes(value: number): number {
  if (!value || Number.isNaN(value)) {
    return 0;
  }
  return value / 60;
}
