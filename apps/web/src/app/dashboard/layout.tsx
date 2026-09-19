import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";
import type { ReactNode } from "react";
import { authOptions } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";
import { KanbanProvider } from "@/components/KanbanProvider";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  return (
    // KanbanProvider fica montado aqui (fora de {children}) para o polling do board continuar
    // rodando ao navegar entre subpáginas do dashboard — só é desmontado se o usuário sair do
    // /dashboard inteiro.
    <KanbanProvider>
      <div>
        <nav className="nav">
          <span className="nav-brand">Crypto Research Intelligence</span>
          <Link href="/dashboard">Home</Link>
          <Link href="/dashboard/research">Research</Link>
          <Link href="/dashboard/rankings">Fundamental Ranking</Link>
          <Link href="/dashboard/kanban">Kanban</Link>
          <Link href="/dashboard/settings">Settings</Link>
          <LogoutButton />
        </nav>
        <main className="page">{children}</main>
      </div>
    </KanbanProvider>
  );
}
