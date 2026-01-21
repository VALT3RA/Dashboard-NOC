import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchHosts, fetchProxiesByIds } from "@/lib/zabbix";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  groupIds: z.string().optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parseResult = querySchema.safeParse({
    groupIds: searchParams.get("groupIds") ?? undefined,
  });

  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Parâmetros inválidos", details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { groupIds } = parseResult.data;
  const parsedGroupIds = groupIds
    ? groupIds
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined;

  try {
    const hosts = await fetchHosts(parsedGroupIds);
    const proxyIds = Array.from(
      new Set(
        hosts
          .map((host) => (typeof host.proxy_hostid === "string" ? host.proxy_hostid : undefined))
          .filter((id): id is string => Boolean(id))
      )
    );
    const proxies = await fetchProxiesByIds(proxyIds);
    const proxyMap = new Map<string, string>();
    proxies.forEach((proxy) => proxyMap.set(proxy.proxyid, proxy.host));

    const data = await Promise.all(
      hosts.map(async (host) => ({
        hostid: host.hostid,
        name: host.name,
        status: host.status ?? "0",
        groups: (host.groups ?? []).map((group) => group.name),
        interfaces: host.interfaces ?? [],
        proxy: host.proxy_hostid ? proxyMap.get(host.proxy_hostid) ?? "" : "",
      }))
    );

    return NextResponse.json({ hosts: data, total: data.length });
  } catch (error) {
    console.error("[host-roster] Failed to list hosts", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar a lista de hosts.",
      },
      { status: 500 }
    );
  }
}
