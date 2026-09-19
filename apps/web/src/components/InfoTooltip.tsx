"use client";

import { useState } from "react";

// Sprint 10 (Parte 12 — Ajuda contextual): popover simples, aberto por clique, sem hover mágico
// e sem posicionamento por mouse (proibido pelo CLAUDE.md — nada de cursor tracking/glow/
// tilt/parallax). Conteúdo é texto curto fixo por métrica, não busca dinâmica — ver
// DATA_DICTIONARY.md para a explicação completa de cada métrica.
export interface InfoTooltipContent {
  oQueE: string;
  porQueColetamos: string;
  comoInterpretar: string;
  limitacoes?: string;
}

export function InfoTooltip({ content }: { content: InfoTooltipContent }) {
  const [open, setOpen] = useState(false);

  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: 6 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Mais informações"
        aria-expanded={open}
        style={{
          cursor: "pointer",
          background: "none",
          border: "none",
          padding: 0,
          color: "#94a3b8",
          fontSize: 13,
          lineHeight: 1,
        }}
      >
        ⓘ
      </button>
      {open && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            zIndex: 10,
            top: "100%",
            left: 0,
            marginTop: 6,
            width: 500,
            background: "#142033",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            padding: 12,
            fontSize: 18,
            color: "#e6edf3",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          <p style={{ margin: "0 0 6px" }}>
            <strong>O que é?</strong> {content.oQueE}
          </p>
          <p style={{ margin: "0 0 6px" }}>
            <strong>Por que coletamos?</strong> {content.porQueColetamos}
          </p>
          <p style={{ margin: content.limitacoes ? "0 0 6px" : 0 }}>
            <strong>Como interpretar?</strong> {content.comoInterpretar}
          </p>
          {content.limitacoes && (
            <p style={{ margin: 0, color: "#94a3b8" }}>
              <strong>Limitações:</strong> {content.limitacoes}
            </p>
          )}
        </div>
      )}
    </span>
  );
}
