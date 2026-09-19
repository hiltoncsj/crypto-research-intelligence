import type { ResearchRunMode, ResearchRunTrigger } from "@crypto-research/shared";

// Sprint 4 (Fase 9): payload do job BullMQ — carrega só o suficiente para o Worker carregar o
// ResearchRun já persistido; nunca duplicamos dados de domínio no payload do job.
export interface ResearchRunJobPayload {
  researchRunId: string;
  mode: ResearchRunMode;
  trigger: ResearchRunTrigger;
  projectSlugs?: string[];
}
