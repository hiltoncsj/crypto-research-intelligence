export * from "./crypto";

export enum ProjectStatus {
  DISCOVERED = "DISCOVERED",
  ACTIVE = "ACTIVE",
  ARCHIVED = "ARCHIVED",
}

export interface Sector {
  id: string;
  name: string;
  parentSectorId: string | null;
}

export interface Chain {
  id: string;
  name: string;
  defillamaChainSlug: string;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  defillamaId: string;
  sectorId: string;
  narrativeId: string | null;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}

// Sprint 3: espelham os enums equivalentes do schema Prisma (packages/database), para uso
// em pacotes que não dependem do Prisma Client diretamente (ex: defi-data, research-engine).
export enum SnapshotSource {
  DEFILLAMA = "DEFILLAMA",
}

export enum DataQuality {
  VALID = "VALID",
  SUSPICIOUS = "SUSPICIOUS",
}

/** Resultado de uma janela de crescimento (Fase 8/9): nunca NaN/Infinity — "N/A" quando não há base histórica. */
export type GrowthResult = number | "N/A";

// Sprint 4: espelham os enums equivalentes do schema Prisma, para uso em packages que não
// dependem do Prisma Client diretamente (ex: queue, worker).
export enum ResearchRunStatus {
  QUEUED = "QUEUED",
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  PARTIAL = "PARTIAL",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export enum ResearchRunMode {
  FULL = "FULL",
  INCREMENTAL = "INCREMENTAL",
}

export enum ResearchRunTrigger {
  MANUAL = "MANUAL",
  SCHEDULED = "SCHEDULED",
  SYSTEM = "SYSTEM",
}

export enum AgentFrequency {
  MANUAL = "MANUAL",
  DAILY = "DAILY",
  EVERY_12_HOURS = "EVERY_12_HOURS",
  WEEKLY = "WEEKLY",
  BIWEEKLY = "BIWEEKLY",
  MONTHLY = "MONTHLY",
}

/** Fase 17: eventos estruturados do ciclo de vida de uma Research Run — nunca inclui secrets. */
export type ResearchRunEvent =
  | "research_run.created"
  | "research_run.queued"
  | "research_run.started"
  | "research_run.project_started"
  | "research_run.project_completed"
  | "research_run.project_failed"
  | "research_run.completed"
  | "research_run.partial"
  | "research_run.failed"
  | "research_run.cancelled"
  | "research_run.lock_acquired"
  | "research_run.lock_release_skipped"
  | "research_run.lock_released"
  | "research_run.scheduler_tick"
  | "research_run.scheduler_skipped_running";

// Sprint 7: espelham os enums equivalentes do schema Prisma (packages/database), mesmo padrão
// acima — usados por packages que não dependem do Prisma Client diretamente.
export enum KanbanColumnKey {
  BACKLOG = "BACKLOG",
  DISCOVERY = "DISCOVERY",
  DATA_COLLECTION = "DATA_COLLECTION",
  FUNDAMENTAL_ANALYSIS = "FUNDAMENTAL_ANALYSIS",
  SCORING = "SCORING",
  PUBLISHED = "PUBLISHED",
}

export enum KanbanCardStatus {
  READY = "READY",
  IN_PROGRESS = "IN_PROGRESS",
  BLOCKED = "BLOCKED",
  DONE = "DONE",
}

export enum KanbanSubcolumn {
  IN_PROGRESS = "IN_PROGRESS",
  READY = "READY",
}

export enum KanbanActorType {
  HUMAN = "HUMAN",
  AGENT = "AGENT",
  SYSTEM = "SYSTEM",
}

/** Seção 43 do Pull System: eventos estruturados do Kanban — mesmo padrão de logging JSON já
 * usado por pipeline/scoring (nunca um Event Bus novo). */
export type KanbanEvent =
  | "kanban.card_created"
  | "kanban.card_moved"
  | "kanban.card_pulled"
  | "kanban.card_pull_rejected"
  | "kanban.card_blocked"
  | "kanban.card_unblocked"
  | "kanban.wip_violation"
  | "kanban.bottleneck_detected"
  | "kanban.urgent_created"
  | "kanban.urgent_rejected"
  | "kanban.run_cancelled_cards_reverted"
  | "kanban.data_collection_baseline_reset";
