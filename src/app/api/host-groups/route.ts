import { NextResponse } from "next/server";
import { fetchHostGroups } from "@/lib/zabbix";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const groups = await fetchHostGroups();
    return NextResponse.json({ groups });
  } catch (error) {
    console.error("[host-groups] Failed to fetch host groups", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os grupos.",
      },
      { status: 500 }
    );
  }
}
