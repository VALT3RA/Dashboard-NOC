export type HostGroupOption = {
  groupid: string;
  name: string;
};

export type DashboardApiResponse = {
  metrics: DashboardMetrics;
};

export type HostGroupsApiResponse = {
  groups: HostGroupOption[];
};

export type HostMetric = {
  hostid: string;
  name: string;
  eventCount: number;
  openEventCount: number;
  detectionMinutes: number;
  responseMinutes: number;
  resolutionMinutes: number;
  availabilityPct: number;
  businessAvailabilityPct: number;
  reachabilityPct: number;
  businessReachabilityPct: number;
};

export type AvailabilityHostImpact = {
  hostid: string;
  name: string;
  windowDowntimeMinutes: number;
  totalDowntimeMinutes: number;
  windowAvailabilityPct: number;
  shareOfGroupWindowDowntimePct: number;
};

export type AvailabilityAlertImpact = {
  eventId: string;
  triggerId?: string;
  name: string;
  severity: number;
  openedAt: string;
  closedAt: string | null;
  windowDowntimeMinutes: number;
  totalDowntimeMinutes: number;
  shareOfGroupWindowDowntimePct: number;
  hostNames: string[];
  alertType: string;
  itemKeys: string[];
};

export type AvailabilityInsights = {
  windowType: "business" | "overall";
  windowLabel: string;
  groupDowntimeMinutes: number;
  topHosts: AvailabilityHostImpact[];
  topAlerts: AvailabilityAlertImpact[];
};

export type CriticalAlertHighlight = {
  eventId: string;
  name: string;
  severity: number;
  hostIds: string[];
  hostNames: string[];
  groupIds: string[];
  groupNames: string[];
  openedAt: string;
  closedAt: string | null;
  isOpen: boolean;
  detectionMinutes: number | null;
  responseMinutes: number | null;
  resolutionMinutes: number;
  businessMinutes: number;
};

export type OpenProblemDetail = {
  eventId: string;
  name: string;
  severity: number;
  severityLabel: string;
  openedAt: string;
  durationMinutes: number;
  detectionMinutes: number | null;
  responseMinutes: number | null;
  hosts: Array<{ hostid: string; name: string }>;
  groupNames: string[];
  tags: Array<{ tag: string; value: string }>;
};

export type EventSeveritySample = {
  eventId: string;
  severity: number;
};

export type HostGroupMetric = {
  groupid: string;
  name: string;
  hosts: number;
  inactiveHosts: number;
  impactIncidents: number;
  hostIds: string[];
  inactiveHostIds: string[];
  severitySummary: SeveritySummary[];
  alerts: number;
  openAlerts: number;
  eventIds?: string[];
  openEventIds?: string[];
  eventSeverities?: EventSeveritySample[];
  impactIncidentIds?: string[];
  alertDetails?: GroupAlertDetail[];
  detectionMinutes: number;
  responseMinutes: number;
  resolutionMinutes: number;
  availabilityPct: number;
  businessAvailabilityPct: number;
  reachabilityPct: number;
  businessReachabilityPct: number;
  availabilityInsights?: AvailabilityInsights;
  reachabilityInsights?: AvailabilityInsights;
  reachabilityOverallInsights?: AvailabilityInsights;
};

export type DashboardMetrics = {
  kpis: {
    detectionMinutes: number;
    responseMinutes: number;
    resolutionMinutes: number;
    availabilityPct: number;
    reachabilityPct: number;
  };
  availability: {
    businessPct: number;
    offHoursPct: number;
    overallPct: number;
  };
  reachability: {
    businessPct: number;
    offHoursPct: number;
    overallPct: number;
  };
  hostCategories: Array<{
    id: string;
    label: string;
    count: number;
    coveragePct: number;
    slaPct: number;
  }>;
  severitySummary: SeveritySummary[];
  hosts: HostMetric[];
  accuracy: {
    falsePositivePct: number;
    falseNegativePct: number;
    precisionPct: number;
  };
  totals: {
    hosts: number;
    coveragePct: number;
    slaPct: number;
  };
  groupTotals: {
    alerts: number;
    openAlerts: number;
    impactIncidents: number;
    hostCount: number;
    inactiveHosts: number;
  };
  groupSummaries?: HostGroupMetric[];
  criticalAlerts: CriticalAlertHighlight[];
  meta: {
    period: string;
    groupId?: string;
    groupName?: string;
    generatedAt: string;
  };
};

export type GroupMetricsApiResponse = {
  meta: {
    period: string;
    generatedAt: string;
    zabbixBaseUrl?: string;
  };
  kpis: DashboardMetrics["kpis"];
  availability: DashboardMetrics["availability"];
  reachability: DashboardMetrics["reachability"];
  totals: DashboardMetrics["groupTotals"];
  groups: HostGroupMetric[];
  severitySummary: SeveritySummary[];
  criticalAlerts: CriticalAlertHighlight[];
};

export type SeveritySummary = {
  severity: number;
  label: string;
  count: number;
};

export type OpenProblemsResponse = {
  problems: OpenProblemDetail[];
  total: number;
  generatedAt: string;
};

export type GroupAlertRecord = {
  eventId: string;
  name: string;
  severity: number;
  severityLabel: string;
  hosts: Array<{ hostid: string; name: string; isActive: boolean }>;
  openedAt: string;
  closedAt: string | null;
  detectionMinutes: number | null;
  responseMinutes: number | null;
  resolutionMinutes: number;
  openDurationMinutes: number;
  ticketOpened: boolean;
  firstAckAt: string | null;
  secondAckAt: string | null;
  secondAckMinutes: number | null;
};

export type GroupAlertDetail = {
  eventId: string;
  name: string;
  severity: number;
  openedAt: string;
  closedAt: string | null;
  firstAckAt: string | null;
  secondAckAt: string | null;
  detectionMinutes: number | null;
  responseMinutes: number | null;
  resolutionMinutes: number;
  hosts: string[];
  isOpen: boolean;
};
