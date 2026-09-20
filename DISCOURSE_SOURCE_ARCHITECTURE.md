# DISCOURSE SOURCE ARCHITECTURE (Sprint 23)

Fórum Discourse oficial de um projeto como fonte de eventos de governança, complementar a
Snapshot (votações) e GitHub Releases (changelogs). Ver `SPRINT_23_IMPLEMENTATION_REPORT.md`
para a evidência da implementação e da auditoria.

## Decisão de identidade

`Project.discourseForumUrl` (`String?`, coluna `discourse_forum_url`) — campo direto, mesmo padrão
de `githubRepo`/`snapshotSpace` (Sprint 19), preenchido **só por curadoria manual** via
`PATCH /api/projects/[slug]`. Nunca inferido por nome ou domínio. Não foi criada uma tabela
genérica `ProjectExternalIdentity` (três campos opcionais ainda não justificam a abstração).

Diferente de GitHub/Snapshot, o **host não é fixo**: cada projeto hospeda o fórum em domínio
próprio. Por isso a validação (`isValidDiscourseForumUrl`, `packages/defi-data/src/
external-identity.ts`) é o único controle de SSRF e exige: HTTPS, hostname com ao menos um ponto,
sem userinfo na URL, sem `localhost`/IP privado/loopback. É reaplicada em `getDiscourseTopics`
(defesa em profundidade, mesmo padrão de `github-client.ts`/`snapshot-client.ts`).

## Coleta

`packages/defi-data/src/discourse-client.ts`, `getDiscourseTopics(forumUrl)`:

- Keyless (API pública de leitura do Discourse). `GET /latest.json` paginado
  (`MAX_LISTING_PAGES = 2`), no máximo `MAX_TOPICS_PER_RUN = 40` tópicos por run.
- Para cada tópico, `GET /t/{id}.json` para obter o corpo do primeiro post (`cooked`), com
  tags HTML removidas por `stripHtml` (não é um parser HTML completo; o texto nunca é
  renderizado de volta como markup).
- Normalização em `normalizeDiscourseTopic` (`adapter.ts`) → `NormalizedDiscourseTopic`.
- Bloco isolado em `pipeline.ts`: falha do fórum de um projeto nunca aborta a run. Sem
  `discourseForumUrl` → `events.discourse_skipped_no_mapping`, nenhuma chamada.

## Persistência e classificação

`persistDiscourseTopicCatalysts` (`events-repository.ts`), idempotente por
`(projectId, source: "DISCOURSE", sourceId = topicId)`:

| Campo                  | Valor                                                            |
| ---------------------- | ---------------------------------------------------------------- |
| `kind` / `category`    | `CATALYST` / `GOVERNANCE`                                        |
| `classificationMethod` | `STRUCTURED_SOURCE` (a engine **nunca** é chamada)               |
| `status`               | `UNKNOWN` (um tópico de discussão nunca é `COMPLETED` por si só) |
| `confidence`           | `MEDIUM` (a existência do tópico é certa; o desfecho não)        |
| `description`          | `null` (o corpo nunca é persistido)                              |

**Por que não a Classification Engine (Sprint 20):** a primeira implementação usava
`classifyEvent` como no GitHub. A auditoria real (240 tópicos, 6 fóruns) mostrou que as regras,
calibradas para changelogs, geram muitos falsos positivos em texto de fórum (frases incidentais
em boilerplate; propostas lidas como fatos consumados). Detalhes no relatório. A decisão segue o
precedente do Snapshot: fonte de governança → `GOVERNANCE` estruturado, sem regras.

## Segurança

- Curadoria manual + validação anti-SSRF em dois pontos.
- Limites de páginas e de tópicos por run; corpo nunca persistido cru.
- Nenhum secret envolvido (fonte keyless).

## Limitações conhecidas

- O corpo do tópico é buscado (1 request por tópico) mas hoje **não é mais usado** — só o título
  é persistido. Ver "Technical Debt" no relatório.
- Só o primeiro post de cada tópico; sem respostas, votos ou status da proposta.
- Só fóruns Discourse; projetos sem fórum Discourse (ex.: `stargate-v2`) ficam sem mapping.
