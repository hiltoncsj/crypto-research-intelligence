import bcrypt from "bcryptjs";
import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

// Sprint 1: single-user MVP. O admin vem de env vars (ADMIN_EMAIL / ADMIN_PASSWORD_HASH),
// não de uma tabela `users` no banco — o plano de implementação não especifica esse
// mecanismo, então optamos pelo caminho mais simples possível para um único usuário.
// Isso deve ser revisitado se o produto crescer para multi-tenant.
export const authOptions: AuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

        if (!adminEmail || !adminPasswordHash) {
          throw new Error("ADMIN_EMAIL/ADMIN_PASSWORD_HASH não configurados");
        }

        if (!credentials?.email || !credentials.password) {
          return null;
        }

        if (credentials.email !== adminEmail) {
          return null;
        }

        const isValid = await bcrypt.compare(credentials.password, adminPasswordHash);
        if (!isValid) {
          return null;
        }

        return { id: "admin", email: adminEmail };
      },
    }),
  ],
};
