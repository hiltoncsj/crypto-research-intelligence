// `next dev`/`next build` rodam com cwd em apps/web (via npm workspace script) e o carregamento
// automático de .env do Next.js só olha o diretório do próprio app — nunca a raiz do monorepo.
// O README documenta um único `.env` na raiz (`cp .env.example .env`), então carregamos esse
// arquivo explicitamente aqui em vez de duplicar o secret num segundo .env em apps/web.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@crypto-research/database", "@crypto-research/shared"],
};

export default nextConfig;
