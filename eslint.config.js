import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
  ignores: [
    "**/node_modules/**",
    "**/.next/**",
    "**/dist/**",
    "**/build/**",
    "**/prisma/generated/**",
    // Diretório não relacionado ao código do monorepo (ativos estáticos externos ao
    // projeto Next.js/TypeScript) — não é código-fonte deste repositório, apenas passou a
    // existir na raiz; nunca deve ser lintado como TS/JS do projeto.
    "designer_system/**",
  ],
});
