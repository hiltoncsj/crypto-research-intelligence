import { randomUUID } from "node:crypto";
import { prisma } from "@crypto-research/database";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@crypto-research/queue", () => ({
  enqueueResearchRun: vi.fn(),
}));

const { getServerSession } = await import("next-auth");
const { enqueueResearchRun } = await import("@crypto-research/queue");
const { GET, POST } = await import("../src/app/api/research-runs/route");
const { GET: GET_ONE } = await import("../src/app/api/research-runs/[id]/route");
const { POST: CANCEL } = await import("../src/app/api/research-runs/[id]/cancel/route");

const mockedGetServerSession = vi.mocked(getServerSession);
const mockedEnqueue = vi.mocked(enqueueResearchRun);

// E-mail exclusivo deste arquivo, nunca o ADMIN_EMAIL real: o afterAll apaga as runs por
// `requestedBy`, e com "admin@example.com" (o mesmo do .env de dev) ele apagava todas as Research
// Runs manuais reais, com scores e seleções — aconteceu em 2026-10-01.
const TEST_REQUESTER = "research-runs-test@example.invalid";

function authed() {
  mockedGetServerSession.mockResolvedValue({ user: { email: TEST_REQUESTER } } as never);
}

function unauthed() {
  mockedGetServerSession.mockResolvedValue(null);
}

// Sprint 4 (Fase 21): testes de autenticação/validação/criação/consulta/cancelamento da API
// de Research Runs. `enqueueResearchRun` é mockado para isolar a rota do BullMQ real (a
// integração de fato do enqueue é coberta por packages/queue/tests/research.queue.test.ts);
// o banco é real (docker-compose), seguindo a mesma filosofia anti-mock de banco do projeto.
describe("Research Runs API", () => {
  afterAll(async () => {
    // fundamental_scores/tokenomics_scores/institutional_capital_scores têm FK RESTRICT para
    // research_run_id (Sprint 5/6) — precisa apagar os scores dependentes antes dos runs,
    // senão o deleteMany falha em qualquer run de teste que tenha sido processado por um
    // worker real durante validação manual (E2E). LIÇÃO DO SPRINT 5, reaplicada no Sprint 6:
    // toda vez que uma nova tabela ganha FK para research_run_id, este cleanup precisa ser
    // atualizado ANTES de rodar a suíte, não depois de um erro aparecer.
    const where = { researchRun: { requestedBy: TEST_REQUESTER } };
    await prisma.fundamentalScore.deleteMany({ where });
    await prisma.tokenomicsScore.deleteMany({ where });
    await prisma.institutionalCapitalScore.deleteMany({ where });
    await prisma.researchRun.deleteMany({ where: { requestedBy: TEST_REQUESTER } });
    await prisma.$disconnect();
  });

  it("GET rejeita acesso não autenticado (401)", async () => {
    unauthed();
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("POST rejeita acesso não autenticado (401)", async () => {
    unauthed();
    const response = await POST(new Request("http://localhost", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
  });

  it("POST rejeita payload inválido (400)", async () => {
    authed();
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ mode: "NOT_A_MODE" }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("POST cria uma ResearchRun QUEUED e enfileira o job", async () => {
    authed();
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ mode: "FULL", trigger: "MANUAL" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.run.status).toBe("QUEUED");
    expect(body.run.mode).toBe("FULL");
    expect(mockedEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ researchRunId: body.run.id, mode: "FULL", trigger: "MANUAL" }),
    );
  });

  it("GET lista runs autenticado", async () => {
    authed();
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(Array.isArray(body.runs)).toBe(true);
  });

  it("GET /:id retorna a run com progresso calculado", async () => {
    authed();
    const run = await prisma.researchRun.create({
      data: {
        mode: "FULL",
        trigger: "MANUAL",
        totalProjects: 4,
        processedProjects: 1,
        requestedBy: TEST_REQUESTER,
      },
    });

    const response = await GET_ONE(new Request("http://localhost"), { params: { id: run.id } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.run.progress).toBe(0.25);
  });

  it("GET /:id retorna 404 para run inexistente", async () => {
    authed();
    const response = await GET_ONE(new Request("http://localhost"), {
      params: { id: randomUUID() },
    });
    expect(response.status).toBe(404);
  });

  it("POST /:id/cancel marca QUEUED como CANCELLED imediatamente", async () => {
    authed();
    const run = await prisma.researchRun.create({
      data: { mode: "FULL", trigger: "MANUAL", totalProjects: 1, requestedBy: TEST_REQUESTER },
    });

    const response = await CANCEL(new Request("http://localhost", { method: "POST" }), {
      params: { id: run.id },
    });
    const body = await response.json();

    expect(body.run.status).toBe("CANCELLED");
  });

  it("POST /:id/cancel sinaliza cancelRequested numa run RUNNING", async () => {
    authed();
    const run = await prisma.researchRun.create({
      data: {
        mode: "FULL",
        trigger: "MANUAL",
        totalProjects: 1,
        status: "RUNNING",
        requestedBy: TEST_REQUESTER,
      },
    });

    const response = await CANCEL(new Request("http://localhost", { method: "POST" }), {
      params: { id: run.id },
    });
    const body = await response.json();

    expect(body.run.status).toBe("RUNNING");
    expect(body.run.cancelRequested).toBe(true);
  });

  it("POST /:id/cancel rejeita acesso não autenticado (401)", async () => {
    unauthed();
    const response = await CANCEL(new Request("http://localhost", { method: "POST" }), {
      params: { id: randomUUID() },
    });
    expect(response.status).toBe(401);
  });
});
