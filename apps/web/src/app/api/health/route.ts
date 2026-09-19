import { NextResponse } from "next/server";
import { prisma } from "@crypto-research/database";
import { pingRedis } from "@crypto-research/queue";

// Sprint 4 (Fase 15): Redis agora é usado de verdade pelo BullMQ (packages/queue) — o health
// check faz um PING real em vez de reportar "not_wired" como no Sprint 1-3.
export async function GET() {
  let database: "healthy" | "unhealthy" = "unhealthy";
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "healthy";
  } catch {
    database = "unhealthy";
  }

  const redisConnected = await pingRedis();
  const redis: "connected" | "disconnected" = redisConnected ? "connected" : "disconnected";

  const status = database === "healthy" && redis === "connected" ? "ok" : "degraded";

  return NextResponse.json(
    {
      status,
      application: "healthy",
      database,
      // Sprint 2 (Fase 19): decidimos não embutir status de providers externos (DefiLlama)
      // aqui — /api/health checa apenas a infraestrutura própria (app/db/redis). Marcar
      // DefiLlama como "healthy" só porque está configurado seria uma falsa indicação de
      // saúde; o status real (configured/REAL/ERROR) fica em GET /api/connections.
      redis,
    },
    { status: status === "ok" ? 200 : 503 },
  );
}
