import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { ToastProvider } from "@/components/toast";
import { getCurrentWorkspaceContext } from "@/lib/workspace";

type AppLayoutProps = {
  children: ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const workspaceContext = await getCurrentWorkspaceContext();

  if (!workspaceContext) {
    redirect("/sign-in");
  }

  return (
    <ToastProvider>
      <div className="app-compact min-h-screen bg-background text-foreground">
        <div className="mx-auto grid min-h-screen max-w-[1500px] grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[236px_1fr]">
          <AppSidebar workspaceContext={workspaceContext} />
          <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[var(--surface)] shadow-sm">
            <header className="flex items-center justify-between border-b border-[color:var(--border)] px-6 py-4">
              <div className="flex items-center gap-4">
                <div className="rounded-full border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 py-1 text-[10px] font-bold tracking-widest text-stone-500 uppercase">
                  Workspace
                </div>
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  {workspaceContext.workspace?.name ?? "Workspace setup"}
                </h1>
              </div>
            </header>
            <main className="page-enter px-5 py-5">{children}</main>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
