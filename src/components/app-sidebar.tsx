"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { WorkspaceContext } from "@/lib/workspace";

import {
  LayoutDashboard,
  Users,
  FileText,
  ClipboardCheck,
  ScrollText,
  Settings,
  Zap,
  ShieldCheck,
} from "lucide-react";
import { UserButton } from "@clerk/nextjs";

const navItems = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/leads", label: "Leads", Icon: Users },
  { href: "/documents", label: "Documents", Icon: FileText },
  { href: "/review-queue", label: "Review Queue", Icon: ClipboardCheck },
  { href: "/audit-log", label: "Audit Log", Icon: ScrollText },
  { href: "/settings", label: "Settings", Icon: Settings },
];

type AppSidebarProps = {
  workspaceContext: WorkspaceContext;
};

export function AppSidebar({ workspaceContext }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col rounded-lg border border-stone-900 bg-stone-950 p-3 text-stone-50 shadow-sm">
      <div className="border-b border-white/10 px-2 pb-4">
        <div className="mb-3 flex items-center gap-2">
           <Zap className="h-4 w-4 text-amber-500 fill-amber-500" />
           <p className="text-[10px] font-bold tracking-[0.16em] text-stone-400 uppercase">
             Revenue Intelligence
           </p>
        </div>
        <h2 className="text-lg font-bold tracking-tight text-white">
          {workspaceContext.workspace?.name ?? "Provisioning..."}
        </h2>
        <div className="mt-2 flex items-center gap-2 text-[11px] font-medium text-stone-400">
           <ShieldCheck className="h-3 w-3" />
           {workspaceContext.workspace?.slug ?? "Awaiting Context"}
        </div>
      </div>

      <nav className="mt-4 flex-1 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition-all duration-300",
                isActive
                  ? "bg-amber-400 text-stone-950"
                  : "text-stone-400 hover:bg-white/5 hover:text-white",
              ].join(" ")}
            >
              <item.Icon className={["h-4 w-4", isActive ? "text-stone-950" : "text-stone-500"].join(" ")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      
      <div className="mt-auto border-t border-white/10 pt-4">
        <p className="px-2 text-[9px] font-bold text-stone-500 uppercase tracking-[0.2em] mb-3">Your Account</p>
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-3 border border-white/5 shadow-inner">
           <UserButton
             appearance={{
               elements: {
                 userButtonAvatarBox: "h-8 w-8 border border-white/10 shadow-sm",
                 userButtonOuterIdentifier: "text-white font-bold"
               }
             }}
             showName={false}
           />
           <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-white">Active session</p>
              <p className="truncate text-[10px] font-medium text-stone-500">Workspace Member</p>
           </div>
        </div>
      </div>
    </aside>
  );
}
