import { defineConfig } from "vitest/config";

// Testes de integração usam PrismaClient real (DATABASE_URL) — carregado explicitamente via
// dotenv em tests/setup.ts, seguindo o mesmo padrão de packages/queue (não há garantia de que o
// shell/CI já tenha a variável exportada antes de `npm test`).
// discovery.integration.test.ts descobre o universo real de projetos elegíveis contra a
// DefiLlama de verdade — na primeira execução contra um banco vazio isso cria (e depois limpa no
// afterAll) dezenas/centenas de Projects reais; o hookTimeout padrão do Vitest (10s) não é
// suficiente para esse cleanup, mesmo o código estando correto.
// kanban-repository.integration.test.ts (e qualquer outra suíte que toque o Kanban) opera sobre
// o board singleton real (`DEFAULT_BOARD_NAME`, "board único do MVP" — packages/research-engine/
// src/kanban-repository.ts) com WIP Limit real de 1 em DISCOVERY/SCORING. Isso não é um problema
// de código do repository (o lock `FOR UPDATE` dentro de `pullCard` está correto — ver o teste
// "pullCard concorrente" acima) — é o Vitest rodando arquivos de teste em paralelo por padrão,
// fazendo dois arquivos disputarem a MESMA linha de coluna do MESMO board ao mesmo tempo.
// `fileParallelism: false` serializa a execução dos arquivos de teste deste workspace (mais lento,
// mas determinístico) em vez de introduzir um segundo board por teste — isolar por board exigiria
// parametrizar ~10 funções exportadas do kanban-repository, uma mudança de arquitetura de
// produção fora do escopo de uma correção de flakiness de teste.
export default defineConfig({
  test: {
    environment: "node",
    hookTimeout: 60_000,
    testTimeout: 60_000,
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
  },
});
