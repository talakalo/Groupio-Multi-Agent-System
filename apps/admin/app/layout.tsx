"use client";

import "./globals.css";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  Bot,
  AlertTriangle,
  HardHat,
  BarChart3,
  Bell,
  Settings,
  ChevronLeft,
  Menu,
  LogOut,
  Shield,
  Users,
  Tag,
} from "lucide-react";

const NAV_ITEMS = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Agents",
    href: "/agents",
    icon: Bot,
  },
  {
    label: "Escalations",
    href: "/escalations",
    icon: AlertTriangle,
  },
  {
    label: "Contractors",
    href: "/contractors",
    icon: HardHat,
  },
  {
    label: "Analytics",
    href: "/analytics",
    icon: BarChart3,
  },
  {
    label: "Users",
    href: "/users",
    icon: Users,
  },
  {
    label: "Offers",
    href: "/offers",
    icon: Tag,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
] as const;

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchInterval: 60_000,
        retry: 2,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={clsx(
        "fixed left-0 top-0 z-40 h-screen bg-white border-r border-surface-200",
        "flex flex-col transition-all duration-200 ease-in-out",
        collapsed ? "w-[72px]" : "w-[var(--sidebar-width)]"
      )}
    >
      {/* Logo area */}
      <div className="flex items-center justify-between h-[var(--header-height)] px-4 border-b border-surface-200">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-600">
              <Shield className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-surface-900 leading-none">
                Groupio
              </h1>
              <span className="text-[10px] font-medium text-surface-400 uppercase tracking-widest">
                Admin
              </span>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="flex items-center justify-center w-full">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-600">
              <Shield className="w-4.5 h-4.5 text-white" />
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={clsx(
                "sidebar-link",
                isActive && "sidebar-link-active",
                collapsed && "justify-center px-0"
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-surface-200 p-3">
        <button
          onClick={onToggle}
          className="sidebar-link w-full justify-center"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft
            className={clsx(
              "w-5 h-5 transition-transform duration-200",
              collapsed && "rotate-180"
            )}
          />
        </button>
      </div>
    </aside>
  );
}

function Header({ sidebarCollapsed }: { sidebarCollapsed: boolean }) {
  return (
    <header
      className={clsx(
        "fixed top-0 right-0 z-30 h-[var(--header-height)]",
        "flex items-center justify-between px-6",
        "bg-white/80 backdrop-blur-md border-b border-surface-200",
        "transition-all duration-200 ease-in-out",
        sidebarCollapsed ? "left-[72px]" : "left-[var(--sidebar-width)]"
      )}
    >
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-surface-800">
          Admin Dashboard
        </h2>
        <span className="badge badge-normal">v0.1.0</span>
      </div>

      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button
          className="relative p-2 rounded-lg text-surface-500 hover:bg-surface-100 transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger-500" />
        </button>

        {/* Settings */}
        <button
          className="p-2 rounded-lg text-surface-500 hover:bg-surface-100 transition-colors"
          aria-label="Settings"
        >
          <Settings className="w-5 h-5" />
        </button>

        {/* Divider */}
        <div className="w-px h-8 bg-surface-200" />

        {/* User info */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-surface-800">Admin User</p>
            <p className="text-xs text-surface-500">admin@groupio.co.il</p>
          </div>
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary-100 text-primary-700 font-semibold text-sm">
            AU
          </div>
          <button
            className="p-1.5 rounded-lg text-surface-400 hover:text-danger-600 hover:bg-danger-50 transition-colors"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const queryClient = getQueryClient();

  return (
    <html lang="en">
      <body>
        <QueryClientProvider client={queryClient}>
          <div className="min-h-screen">
            <Sidebar
              collapsed={sidebarCollapsed}
              onToggle={() => setSidebarCollapsed((prev) => !prev)}
            />
            <Header sidebarCollapsed={sidebarCollapsed} />

            <main
              className={clsx(
                "pt-[var(--header-height)] min-h-screen",
                "transition-all duration-200 ease-in-out",
                sidebarCollapsed ? "ml-[72px]" : "ml-[var(--sidebar-width)]"
              )}
            >
              <div className="p-6">{children}</div>
            </main>
          </div>
        </QueryClientProvider>
      </body>
    </html>
  );
}
