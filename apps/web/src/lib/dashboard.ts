import {
  getCatalystsOverview,
  getDataHealthOverview,
  getDivergenceOverview,
  getEventIntelligenceOverview,
  getFundamentalMovementOverview,
  getResearchOverview,
  getRisksOverview,
  type CatalystsOverview,
  type DataHealthOverview,
  type DivergenceOverview,
  type EventIntelligenceOverview,
  type FundamentalMovementEntry,
  type ResearchOverview,
  type RisksOverview,
} from "@crypto-research/research-engine";

// Sprint 14 (Parte 18-22) — camada de serviço para a Home real do Dashboard, mesmo padrão de
// apps/web/src/lib/research.ts/scores.ts: rota HTTP fina, lógica de agregação em
// packages/research-engine (dashboard-intelligence.ts). Esta camada só lê o que já foi
// calculado a partir de dados persistidos — nunca dispara coleta nem calcula fora do
// research-engine.
//
// Sprint 15 (Parte 20/27/37): Catalysts/Risks entram na MESMA resposta em vez de 2 rotas novas
// (`GET /api/dashboard/catalysts`/`/risks` sugeridas no prompt) — consolidação deliberada
// (seção 27: "reutilizar a arquitetura existente", "não criar camada paralela"), já que a Home
// sempre carrega tudo de uma vez mesmo.
//
// Sprint 16 (Parte 26/27): Event Intelligence segue a MESMA consolidação — não uma rota
// `/api/dashboard/event-impacts` separada.

export interface DashboardFundamentalView {
  research: ResearchOverview;
  dataHealth: DataHealthOverview;
  movement: FundamentalMovementEntry[];
  divergence: DivergenceOverview;
  catalysts: CatalystsOverview;
  risks: RisksOverview;
  eventIntelligence: EventIntelligenceOverview;
}

export async function getDashboardFundamentalView(): Promise<DashboardFundamentalView> {
  const [research, dataHealth, movement, divergence, catalysts, risks, eventIntelligence] =
    await Promise.all([
      getResearchOverview(),
      getDataHealthOverview(),
      getFundamentalMovementOverview(10),
      getDivergenceOverview(),
      getCatalystsOverview(),
      getRisksOverview(),
      getEventIntelligenceOverview(),
    ]);
  return { research, dataHealth, movement, divergence, catalysts, risks, eventIntelligence };
}
