import { NextResponse } from "next/server";
import { listOpenProblems } from "@/lib/open-problems";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await listOpenProblems();
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[open-problems] Failed to list open problems", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os problemas em aberto.",
      },
      { status: 500 }
    );
  }
}
