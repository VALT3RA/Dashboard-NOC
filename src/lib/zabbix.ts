import "server-only";
import { Agent } from "undici";

type JsonRpcSuccess<T> = {
  jsonrpc: "2.0";
  result: T;
  id: number;
};

type JsonRpcError = {
  jsonrpc: "2.0";
  error: {
    code: number;
    message: string;
    data?: string;
  };
  id: number;
};

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcError;

export type ZabbixHostGroup = {
  groupid: string;
  name: string;
};

export type ZabbixHost = {
  hostid: string;
  name: string;
  status?: string;
  proxy_hostid?: string;
  interfaces?: Array<{ ip?: string; dns?: string; port?: string }>;
  inventory?: {
    type?: string;
    type_full?: string;
    hardware?: string;
    alias?: string;
    os?: string;
  };
  items?: Array<{ itemid: string }>;
  tags?: Array<{ tag: string; value: string }>;
  groups?: ZabbixHostGroup[];
};

export type ZabbixProxy = {
  proxyid: string;
  host: string;
  status?: string;
};

export type ZabbixAcknowledge = {
  acknowledgeid: string;
  action: string;
  clock: string;
  message?: string;
  old_severity?: string;
  new_severity?: string;
  userid?: string;
  user?: string;
};

export type ZabbixProblem = {
  eventid: string;
  r_eventid?: string;
  objectid?: string;
  clock: string;
  ns: string;
  name: string;
  severity: string;
  acknowledged: string;
  tags?: Array<{ tag: string; value: string }>;
  hosts?: Array<{ hostid: string; name: string }>;
  acknowledges?: ZabbixAcknowledge[];
};

export type ZabbixEvent = {
  eventid: string;
  clock: string;
  ns: string;
  r_eventid?: string;
};

export type ZabbixItem = {
  itemid: string;
  key_?: string;
  name?: string;
};

export type ZabbixTrigger = {
  triggerid: string;
  description?: string;
  comments?: string;
  items?: ZabbixItem[];
};

const API_URL =
  process.env.ZABBIX_API_URL ??
  process.env.ZABBIX_API_ENDPOINT ??
  "https://noc.contego.com.br/api_jsonrpc.php";

const UI_URL =
  process.env.ZABBIX_BASE_URL ??
  process.env.ZABBIX_UI_URL ??
  process.env.ZABBIX_WEB_URL ??
  process.env.ZABBIX_URL;

const API_TOKEN = process.env.ZABBIX_API_TOKEN;

const DEFAULT_HEADERS = {
  "Content-Type": "application/json-rpc",
};

const CONNECT_TIMEOUT_MS = Math.max(
  1,
  parseNumber(process.env.ZABBIX_CONNECT_TIMEOUT, 20000)
);
const MAX_RETRIES = Math.max(
  0,
  Math.floor(parseNumber(process.env.ZABBIX_MAX_RETRIES, 2))
);
const RETRY_DELAY_MS = Math.max(
  0,
  parseNumber(process.env.ZABBIX_RETRY_DELAY_MS, 1000)
);

const RETRYABLE_ERROR_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_SOCKET_TIMEOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
]);

const dispatcher = new Agent({
  connect: {
    timeout: CONNECT_TIMEOUT_MS,
  },
});

export function getZabbixBaseUrl(): string | null {
  const source = UI_URL ?? API_URL;
  if (!source) return null;
  try {
    const url = new URL(source);
    url.pathname = url.pathname.replace(/\/api_jsonrpc\.php$/i, "");
    url.search = "";
    url.hash = "";
    const normalized = url.toString().replace(/\/$/, "");
    return normalized || null;
  } catch {
    if (!UI_URL) return null;
    return UI_URL.replace(/\/$/, "");
  }
}

async function callZabbix<T>(
  method: string,
  params: Record<string, unknown>
): Promise<T> {
  if (!API_TOKEN) {
    throw new Error(
      "ZABBIX_API_TOKEN não configurado. Defina-o no arquivo .env.local."
    );
  }

  const payload = {
    jsonrpc: "2.0" as const,
    method,
    params,
    id: Date.now(),
    auth: API_TOKEN,
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: DEFAULT_HEADERS,
        body: JSON.stringify(payload),
        cache: "no-store",
        dispatcher,
      });

      if (!response.ok) {
        throw new Error(
          `Erro ${response.status} ao falar com o Zabbix (${method})`
        );
      }

      const data = (await response.json()) as JsonRpcResponse<T>;

      if ("error" in data) {
        throw new Error(
          `Zabbix retornou erro ${data.error.code} (${method}): ${data.error.data ?? data.error.message}`
        );
      }

      return data.result;
    } catch (error) {
      const retryable = isRetryableNetworkError(error);
      const lastAttempt = attempt === MAX_RETRIES;

      if (!retryable || lastAttempt) {
        if (retryable) {
          throw buildNetworkError(method, error);
        }
        throw ensureError(error);
      }

      const delayMs = RETRY_DELAY_MS * (attempt + 1);
      if (delayMs > 0) {
        await wait(delayMs);
      }
    }
  }

  throw new Error(`Falha inesperada ao falar com o Zabbix (${method}).`);
}

export async function fetchHostGroups(): Promise<ZabbixHostGroup[]> {
  return callZabbix<ZabbixHostGroup[]>("hostgroup.get", {
    output: ["groupid", "name"],
    real_hosts: 1,
    sortfield: "name",
  });
}

export async function fetchHosts(
  groupId?: string | string[]
): Promise<ZabbixHost[]> {
  const groupIds =
    Array.isArray(groupId) && groupId.length
      ? groupId
      : groupId
        ? [groupId]
        : undefined;

  return callZabbix<ZabbixHost[]>("host.get", {
    output: ["hostid", "name", "status"],
    selectInventory: ["type", "type_full", "hardware", "os", "alias"],
    selectTags: ["tag", "value"],
    selectGroups: ["groupid", "name"],
    selectInterfaces: ["ip", "dns", "port"],
    groupids: groupIds,
    limit: Number(process.env.ZABBIX_HOST_LIMIT ?? 10000),
  });
}

export async function fetchProxyByHost(
  host: string
): Promise<ZabbixProxy | null> {
  const proxies = await callZabbix<ZabbixProxy[]>("proxy.get", {
    output: ["proxyid", "host", "status"],
    filter: {
      host: [host],
    },
    limit: 1,
  });
  return proxies.length ? proxies[0] : null;
}

export async function fetchHostsMonitoredByProxy(
  proxyHost: string
): Promise<{ proxy: ZabbixProxy | null; hosts: ZabbixHost[] }> {
  const proxy = await fetchProxyByHost(proxyHost);
  if (!proxy) {
    return { proxy: null, hosts: [] };
  }

  const hosts = await callZabbix<ZabbixHost[]>("host.get", {
    output: ["hostid", "name", "status", "proxy_hostid"],
    selectInventory: ["type", "type_full", "hardware", "os", "alias"],
    selectTags: ["tag", "value"],
    selectGroups: ["groupid", "name"],
    selectInterfaces: ["ip"],
    selectItems: ["itemid"],
    proxyids: [proxy.proxyid],
    templated_hosts: 0,
    filter: {
      status: ["0"],
    },
    sortfield: "name",
    limit: Number(process.env.ZABBIX_HOST_LIMIT ?? 10000),
  });

  return { proxy, hosts };
}

export async function fetchProxiesByIds(
  proxyIds: string[]
): Promise<ZabbixProxy[]> {
  if (!proxyIds.length) return [];
  return callZabbix<ZabbixProxy[]>("proxy.get", {
    output: ["proxyid", "host", "status"],
    proxyids: proxyIds,
  });
}

export async function fetchHostsByIds(hostIds: string[]): Promise<ZabbixHost[]> {
  if (!hostIds.length) {
    return [];
  }

  const chunks: string[][] = [];
  for (let i = 0; i < hostIds.length; i += 100) {
    chunks.push(hostIds.slice(i, i + 100));
  }

  const results = await Promise.all(
    chunks.map((batch) =>
      callZabbix<ZabbixHost[]>("host.get", {
        output: ["hostid", "name", "status"],
        selectInventory: ["type", "type_full", "hardware", "os", "alias"],
        selectTags: ["tag", "value"],
        selectGroups: ["groupid", "name"],
        selectInterfaces: ["ip"],
        hostids: batch,
      })
    )
  );

  return results.flat();
}

export async function fetchProblemsByIds(
  eventIds: string[]
): Promise<ZabbixProblem[]> {
  if (!eventIds.length) {
    return [];
  }

  const batches: string[][] = [];
  for (let i = 0; i < eventIds.length; i += 100) {
    batches.push(eventIds.slice(i, i + 100));
  }

  const results = await Promise.all(
    batches.map((batch) =>
      callZabbix<ZabbixProblem[]>("event.get", {
        output: [
          "eventid",
          "r_eventid",
          "objectid",
          "clock",
          "ns",
          "name",
          "severity",
          "acknowledged",
        ],
        selectHosts: ["hostid", "name"],
        selectTags: ["tag", "value"],
        select_acknowledges: "extend",
        eventids: batch,
        source: 0,
        object: 0,
      })
    )
  );

  return results.flat();
}

export async function fetchProblems(params: {
  groupId?: string;
  groupIds?: string[];
  timeFrom: number;
  timeTill: number;
}): Promise<ZabbixProblem[]> {
  const groupIds =
    params.groupIds && params.groupIds.length
      ? params.groupIds
      : params.groupId
        ? [params.groupId]
        : undefined;

  const pageSize = Math.max(
    1,
    parseNumber(process.env.ZABBIX_PROBLEM_LIMIT, 5000)
  );
  const maxPages = Math.max(
    1,
    parseNumber(process.env.ZABBIX_PROBLEM_MAX_PAGES, 5)
  );

  // We page backwards in time (most recent first) to avoid truncating
  // older events when the instance has many alerts in the month.
  let cursorTimeTill = params.timeTill;
  let page = 0;
  const all: ZabbixProblem[] = [];

  while (page < maxPages) {
    page += 1;
    const batch = await callZabbix<ZabbixProblem[]>("event.get", {
      output: [
        "eventid",
        "r_eventid",
        "objectid",
        "clock",
        "ns",
        "name",
        "severity",
        "acknowledged",
      ],
      selectHosts: ["hostid", "name"],
      selectTags: ["tag", "value"],
      select_acknowledges: "extend",
      groupids: groupIds,
      time_from: params.timeFrom,
      time_till: cursorTimeTill,
      source: 0, // trigger events
      object: 0,
      value: 1, // problems only
      limit: pageSize,
      sortfield: "clock",
      sortorder: "DESC",
    });

    all.push(...batch);

    if (batch.length < pageSize) {
      break; // fetched everything inside window
    }

    // Continue from the oldest event of this batch, stepping one second back
    // to avoid duplicates.
    const oldestClock = Math.min(
      ...batch.map((problem) => Number(problem.clock) || cursorTimeTill)
    );
    if (!Number.isFinite(oldestClock)) {
      break;
    }
    const nextCursor = oldestClock - 1;
    if (nextCursor <= params.timeFrom) {
      break;
    }
    cursorTimeTill = nextCursor;
  }

  return all;
}

export async function fetchCurrentProblems(): Promise<ZabbixProblem[]> {
  return callZabbix<ZabbixProblem[]>("problem.get", {
    output: [
      "eventid",
      "name",
      "clock",
      "severity",
      "acknowledged",
      "r_eventid",
    ],
    selectHosts: ["hostid", "name"],
    selectTags: "extend",
    select_acknowledges: "extend",
    selectSuppressionData: "extend",
    recent: true,
    limit: Number(process.env.ZABBIX_OPEN_PROBLEM_LIMIT ?? 5000),
  });
}

export async function fetchRecoveryEvents(
  eventIds: string[]
): Promise<Record<string, ZabbixEvent>> {
  if (!eventIds.length) {
    return {};
  }

  const batches: string[][] = [];
  for (let i = 0; i < eventIds.length; i += 100) {
    batches.push(eventIds.slice(i, i + 100));
  }

  const allEvents: ZabbixEvent[] = [];
  // Avoid hammering Zabbix: fetch batches sequentially.
  for (const batch of batches) {
    // eslint-disable-next-line no-await-in-loop
    const result = await callZabbix<ZabbixEvent[]>("event.get", {
      eventids: batch,
      output: ["eventid", "clock", "ns"],
    });
    allEvents.push(...result);
  }

  return allEvents.reduce<Record<string, ZabbixEvent>>((acc, event) => {
    acc[event.eventid] = event;
    return acc;
  }, {});
}

export async function fetchResolvedEventsInRange(params: {
  timeFrom: number;
  timeTill: number;
}): Promise<ZabbixEvent[]> {
  return callZabbix<ZabbixEvent[]>("event.get", {
    output: ["eventid", "clock", "ns", "r_eventid"],
    time_from: params.timeFrom,
    time_till: params.timeTill,
    source: 0,
    object: 0,
    value: 0,
    limit: Number(process.env.ZABBIX_RESOLVED_EVENT_LIMIT ?? 5000),
  });
}

export async function fetchTriggersByIds(
  triggerIds: string[]
): Promise<ZabbixTrigger[]> {
  if (!triggerIds.length) return [];

  const batches: string[][] = [];
  for (let i = 0; i < triggerIds.length; i += 100) {
    batches.push(triggerIds.slice(i, i + 100));
  }

  const results = await Promise.all(
    batches.map((batch) =>
      callZabbix<ZabbixTrigger[]>("trigger.get", {
        output: ["triggerid", "description", "comments"],
        selectItems: ["itemid", "key_", "name"],
        triggerids: batch,
      })
    )
  );

  return results.flat();
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type MaybeErrorWithCode = {
  code?: unknown;
  errno?: unknown;
  cause?: unknown;
};

function extractErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const candidate = error as MaybeErrorWithCode;
  if (typeof candidate.code === "string" && candidate.code) {
    return candidate.code;
  }
  if (typeof candidate.errno === "string" && candidate.errno) {
    return candidate.errno;
  }
  if (candidate.cause) {
    return extractErrorCode(candidate.cause);
  }
  return undefined;
}

function isRetryableNetworkError(error: unknown): boolean {
  const code = extractErrorCode(error);
  return Boolean(code && RETRYABLE_ERROR_CODES.has(code));
}

function buildNetworkError(method: string, error: unknown): Error {
  const code = extractErrorCode(error);
  const detail =
    typeof code === "string" && code.length
      ? ` (${code})`
      : error instanceof Error && error.message
        ? `: ${error.message}`
        : "";
  return new Error(
    `Falha ao comunicar com o Zabbix (${method})${detail}`,
    error instanceof Error ? { cause: error } : undefined
  );
}

function ensureError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error("Erro inesperado ao conversar com o Zabbix.");
}
