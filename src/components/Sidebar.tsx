"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";

type NavItem = { href: string; label: string };
type NavGroup = { label: string; icon: React.ReactNode; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: "Comentários",
    icon: <svg width="15" height="15" fill="none" viewBox="0 0 16 16"><path d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v6A1.5 1.5 0 0112.5 11H9l-3 2.5V11H3.5A1.5 1.5 0 012 9.5v-6z" fill="currentColor"/></svg>,
    items: [
      { href: "/dashboard/comments", label: "Comentários" },
      { href: "/dashboard/comments/install", label: "Instalar widget" },
      { href: "/dashboard/comments/settings", label: "Configurações" },
    ],
  },
  {
    label: "Popups",
    icon: <svg width="15" height="15" fill="none" viewBox="0 0 16 16"><rect x="1" y="3" width="14" height="10" rx="2" fill="currentColor"/><path d="M10 7H6M8 5v4" stroke="white" strokeWidth="1.2" strokeLinecap="round"/></svg>,
    items: [
      { href: "/dashboard/popups", label: "Meus popups" },
      { href: "/dashboard/popups/install", label: "Instalar popup" },
    ],
  },
  {
    label: "Leads",
    icon: <svg width="15" height="15" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="5" r="3" fill="currentColor"/><path d="M2 13c0-2.21 2.686-4 6-4s6 1.79 6 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    items: [
      { href: "/dashboard/leads", label: "Leads capturados" },
    ],
  },
  {
    label: "Canvas",
    icon: <svg width="15" height="15" fill="none" viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" rx="2" fill="currentColor" opacity=".15"/><rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.2"/><circle cx="5" cy="5" r="1.5" fill="currentColor"/><path d="M1 10l4-4 3 3 2-2 5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    items: [
      { href: "/dashboard/canvas", label: "Galeria" },
      { href: "/dashboard/canvas/editor?format=square", label: "Nova arte" },
    ],
  },
  {
    label: "Chat IA",
    icon: <svg width="15" height="15" fill="none" viewBox="0 0 16 16"><path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H9l-3 2.5V11H3a1 1 0 01-1-1V3z" fill="currentColor"/><circle cx="5" cy="7" r="1" fill="white"/><circle cx="8" cy="7" r="1" fill="white"/><circle cx="11" cy="7" r="1" fill="white"/></svg>,
    items: [
      { href: "/dashboard/chat/produtos", label: "Produtos" },
      { href: "/dashboard/chat/configuracoes", label: "Configurações" },
    ],
  },
];

export default function Sidebar({ siteName }: { siteName?: string }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const activeGroup = NAV.findIndex(g => g.items.some(i => pathname === i.href || pathname.startsWith(i.href + "/")));
  const [open, setOpen] = useState<number>(activeGroup >= 0 ? activeGroup : 0);

  const isItemActive = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/") && !pathname.includes("/dashboard/popups/") );

  return (
    <aside className="w-52 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 h-screen sticky top-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-gray-100">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 4C2 3.45 2.45 3 3 3h10c.55 0 1 .45 1 1v6c0 .55-.45 1-1 1H3c-.55 0-1-.45-1-1V4z" fill="white" fillOpacity=".9"/><path d="M4 10.5v2l2.5-2H4z" fill="white"/></svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-tight">Comentei</p>
            {siteName && <p className="text-xs text-gray-400 truncate">{siteName}</p>}
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-1 overflow-y-auto">
        {NAV.map((group, gi) => {
          const isOpen = open === gi;
          const groupActive = group.items.some(i => isItemActive(i.href));
          return (
            <div key={group.label}>
              <button
                onClick={() => setOpen(isOpen ? -1 : gi)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${groupActive ? "text-indigo-700 font-medium" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"}`}>
                <span className={groupActive ? "text-indigo-600" : "text-gray-400"}>{group.icon}</span>
                <span className="flex-1 text-left">{group.label}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`text-gray-300 transition-transform ${isOpen ? "rotate-180" : ""}`}>
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {isOpen && (
                <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-gray-100 pl-3">
                  {group.items.map(item => (
                    <Link key={item.href} href={item.href}
                      className={`text-sm py-1.5 px-2 rounded-lg transition ${isItemActive(item.href) ? "text-indigo-700 font-medium bg-indigo-50" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}>
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-gray-100">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-medium text-indigo-700 flex-shrink-0">
            {user?.email?.[0].toUpperCase()}
          </div>
          <p className="text-xs text-gray-500 truncate flex-1 min-w-0">{user?.email}</p>
        </div>
        <button onClick={logout} className="text-xs text-gray-400 hover:text-gray-600 transition px-1">Sair</button>
      </div>
    </aside>
  );
}
