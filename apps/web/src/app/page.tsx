import Link from "next/link";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import styles from "./page.module.css";

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});

export default function RootPage() {
  return (
    <div
      className={`${styles.page} ${plexMono.variable} ${plexSans.variable}`}
      style={{ fontFamily: "var(--font-sans)" }}
    >
      <header className={styles.header}>
        <nav className={`${styles.wrap} ${styles.nav}`}>
          <div className={styles.brand}>
            <span className={styles.brandDot} />
            CRYPTO RESEARCH INTELLIGENCE
          </div>
          <div className={styles.navlinks}>
            <a href="#pipeline">Pipeline</a>
            <a href="#scoring">Scoring</a>
            <a href="#ranking">Ranking</a>
            <a href="#stack">Stack</a>
            <Link href="/login" className={styles.loginBtn}>
              Login
            </Link>
          </div>
        </nav>
      </header>

      <main className={styles.wrap}>
        <section className={styles.hero} style={{ borderTop: "none", paddingBlock: "56px 40px" }}>
          <div className={styles.eyebrow}>Fundamentals-only research engine</div>
          <h1>
            Rastreando fundamentos
            <br />
            on-chain <span className={styles.accent}>sem ruído de narrativa.</span>
          </h1>
          <p className={styles.heroSub}>
            Coleta TVL, Revenue e Fees direto da fonte, calcula crescimento por janela, pontua
            contra o próprio setor por percentile rank e publica um Research Trace auditável — cada
            número do Score aponta de volta pra fonte, timestamp e cálculo que o gerou.
          </p>
          <div className={styles.heroMeta}>
            <span className={styles.pill}>DefiLlama · dados reais</span>
            <span className={styles.pill}>Score 0–100 · percentile por setor</span>
            <span className={styles.pill}>Confidence independente do Score</span>
            <span className={styles.pill}>Não é recomendação de investimento</span>
          </div>
          <div className={styles.heroCta}>
            <Link href="/login" className={styles.ctaPrimary}>
              Entrar no dashboard
            </Link>
            <a href="#pipeline" className={styles.ctaSecondary}>
              Ver como funciona ↓
            </a>
          </div>

          <div className={styles.terminal}>
            <div className={styles.termBar}>
              <span className={styles.lights}>
                <span />
                <span />
                <span />
              </span>
              research-run.log — pipeline ativo
            </div>
            <div className={styles.termBody}>
              <div className={styles.flow}>
                <span className={styles.flowNode}>DefiLlama</span>
                <span className={styles.flowArrow}>→</span>
                <span className={styles.flowNode}>Collector</span>
                <span className={styles.flowArrow}>→</span>
                <span className={styles.flowNode}>Validator</span>
                <span className={styles.flowArrow}>→</span>
                <span className={styles.flowNode}>Postgres</span>
                <span className={styles.flowArrow}>→</span>
                <span className={styles.flowNode}>Metrics</span>
                <span className={styles.flowArrow}>→</span>
                <span className={`${styles.flowNode} ${styles.hot}`}>Scoring Engine</span>
                <span className={styles.flowArrow}>→</span>
                <span className={styles.flowNode}>Ranking</span>
              </div>
            </div>
          </div>
        </section>

        <section id="pipeline" className={styles.section}>
          <div className={styles.sectionHead}>
            <div className={styles.eyebrow}>Kanban Pull System</div>
            <h2>O pipeline puxa trabalho, nunca empurra.</h2>
            <p>
              Cada etapa só recebe um projeto novo quando tem capacidade real de processá-lo — WIP
              Limit aplicado no backend, não é decoração de frontend. Uma falha trava o card na
              etapa atual com o motivo, nunca avança silenciosamente.
            </p>
          </div>
          <div className={styles.grid}>
            <div className={styles.card}>
              <div className={styles.k}>01 · Discovery</div>
              <h3>
                Projeto identificado <span className={styles.colWip}>WIP 1/1</span>
              </h3>
              <p>
                Upsert do projeto a partir do payload da DefiLlama — sector, chains, token summary.
              </p>
            </div>
            <div className={styles.card}>
              <div className={styles.k}>02 · Data Collection</div>
              <h3>
                Coleta de snapshots <span className={styles.colWip}>WIP 1/1</span>
              </h3>
              <p>
                TVL histórico, Fees e Revenue — persistidos com proveniência completa (fonte,
                retrieved_at).
              </p>
            </div>
            <div className={styles.card}>
              <div className={styles.k}>03 · Fundamental Analysis</div>
              <h3>
                Métricas de janela <span className={styles.colWip}>WIP 1/1</span>
              </h3>
              <p>
                Growth 7d/30d/90d e ratios de eficiência (Revenue/TVL, Fees/TVL) calculados sobre a
                série.
              </p>
            </div>
            <div className={styles.card}>
              <div className={styles.k}>04 · Scoring</div>
              <h3>
                Percentile por setor{" "}
                <span className={`${styles.colWip} ${styles.tight}`}>WIP 1/1</span>
              </h3>
              <p>Cada sub-métrica comparada aos pares do mesmo setor na mesma Research Run.</p>
            </div>
            <div className={styles.card}>
              <div className={styles.k}>05 · Published</div>
              <h3>
                Score + Trace publicados <span className={styles.colWip}>sem limite</span>
              </h3>
              <p>
                Fica disponível no Ranking e na página do projeto, com o Research Trace clicável.
              </p>
            </div>
            <div className={styles.card}>
              <div className={styles.k}>Backlog</div>
              <h3>
                Fila de entrada <span className={styles.colWip}>sem limite</span>
              </h3>
              <p>Cards manuais ou descobertos aguardando capacidade da próxima etapa puxar.</p>
            </div>
          </div>
        </section>

        <section id="scoring" className={styles.section}>
          <div className={styles.sectionHead}>
            <div className={styles.eyebrow}>Fundamental Score</div>
            <h2>Pesos explícitos, sem número mágico escondido.</h2>
            <p>
              Cada grupo é normalizado por percentile rank dentro do próprio setor antes de
              multiplicar pelo peso — evita hardcodar limiar fixo (&quot;+50% = nota máxima&quot;)
              que não escala entre setores com dinâmicas diferentes.
            </p>
          </div>
          <div className={styles.barBox}>
            <div className={styles.barRow}>
              <span className={styles.barLabel}>TVL Growth</span>
              <span className={styles.barTrack}>
                <span className={styles.barFill} style={{ width: "32%" }} />
              </span>
              <span className={`${styles.barVal} ${styles.tab}`}>8 pts</span>
            </div>
            <div className={styles.barRow}>
              <span className={styles.barLabel}>Revenue Growth</span>
              <span className={styles.barTrack}>
                <span className={styles.barFill} style={{ width: "32%" }} />
              </span>
              <span className={`${styles.barVal} ${styles.tab}`}>8 pts</span>
            </div>
            <div className={styles.barRow}>
              <span className={styles.barLabel}>Fees Growth</span>
              <span className={styles.barTrack}>
                <span className={styles.barFill} style={{ width: "24%" }} />
              </span>
              <span className={`${styles.barVal} ${styles.tab}`}>6 pts</span>
            </div>
            <div className={styles.barRow}>
              <span className={styles.barLabel}>Efficiency</span>
              <span className={styles.barTrack}>
                <span className={styles.barFill} style={{ width: "32%" }} />
              </span>
              <span className={`${styles.barVal} ${styles.tab}`}>8 pts</span>
            </div>
          </div>
          <p className={styles.note}>
            Confidence é calculada à parte — completude dos campos, recência do dado e anomalias
            reportadas pelo Validator. Nunca uma IA avaliando confiança: fórmula fixa e documentada.
          </p>
        </section>

        <section id="ranking" className={styles.section}>
          <div className={styles.sectionHead}>
            <div className={styles.eyebrow}>Fundamental Ranking · dados ilustrativos</div>
            <h2>Ordenado por força fundamental, não por hype.</h2>
            <p>
              Exemplo com os três protocolos usados como fixture de desenvolvimento — números abaixo
              são ilustrativos, não uma leitura ao vivo do banco.
            </p>
          </div>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Projeto</th>
                  <th>Setor</th>
                  <th>Score</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={`${styles.mono} ${styles.tab}`}>1</td>
                  <td>Aave</td>
                  <td>Lending</td>
                  <td className={`${styles.num} ${styles.tab}`}>78.4 / 100</td>
                  <td>
                    <span className={styles.conf}>
                      <span className={styles.confBar}>
                        <i style={{ width: "92%" }} />
                      </span>
                      92%
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className={`${styles.mono} ${styles.tab}`}>2</td>
                  <td>Uniswap</td>
                  <td>DEX</td>
                  <td className={`${styles.num} ${styles.tab}`}>71.2 / 100</td>
                  <td>
                    <span className={styles.conf}>
                      <span className={styles.confBar}>
                        <i style={{ width: "87%" }} />
                      </span>
                      87%
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className={`${styles.mono} ${styles.tab}`}>3</td>
                  <td>Lido</td>
                  <td>Liquid Staking</td>
                  <td className={`${styles.num} ${styles.tab}`}>64.9 / 100</td>
                  <td>
                    <span className={styles.conf}>
                      <span className={styles.confBar}>
                        <i style={{ width: "74%" }} />
                      </span>
                      74%
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="stack" className={styles.section}>
          <div className={styles.sectionHead}>
            <div className={styles.eyebrow}>Stack</div>
            <h2>Sem mock de fonte externa, sem stack especulativa.</h2>
            <p>
              Toda integração com a DefiLlama é real, inclusive em teste — nunca um status
              &quot;saudável&quot; fabricado no lugar de uma chamada de verdade.
            </p>
          </div>
          <div className={styles.stackRow}>
            <span className={styles.chip}>Next.js 14</span>
            <span className={styles.chip}>TypeScript</span>
            <span className={styles.chip}>PostgreSQL</span>
            <span className={styles.chip}>Prisma</span>
            <span className={styles.chip}>Redis</span>
            <span className={styles.chip}>BullMQ</span>
            <span className={styles.chip}>NextAuth</span>
            <span className={styles.chip}>DefiLlama API</span>
          </div>
        </section>

        <footer className={styles.footer}>
          <p>Crypto Research Intelligence — plataforma interna de pesquisa fundamentalista.</p>
          <p>Scores e rankings não constituem recomendação de investimento.</p>
        </footer>
      </main>
    </div>
  );
}
