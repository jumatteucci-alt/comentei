"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

const NAV = [
  { href: "/dashboard", label: "Visão geral", icon: (
    <svg width="16" height="16" fill="none" viewBox="0 0 16 16"><rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".9"/><rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".4"/><rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".4"/><rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".4"/></svg>
  )},
  { href: "/dashboard/comments", label: "Comentários", icon: (
    <svg width="16" height="16" fill="none" viewBox="0 0 16 16"><path d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v6A1.5 1.5 0 0112.5 11H9l-3 2.5V11H3.5A1.5 1.5 0 012 9.5v-6z" fill="currentColor" opacity=".85"/></svg>
  )},
  { href: "/dashboard/popups", label: "Popups", icon: (
    <svg width="16" height="16" fill="none" viewBox="0 0 16 16"><rect x="1" y="3" width="14" height="10" rx="2" fill="currentColor" opacity=".85"/><path d="M10 7H6M8 5v4" stroke="white" strokeWidth="1.2" strokeLinecap="round"/></svg>
  )},
  { href: "/dashboard/leads", label: "Leads", icon: (
    <svg width="16" height="16" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="5" r="3" fill="currentColor" opacity=".85"/><path d="M2 13c0-2.21 2.686-4 6-4s6 1.79 6 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".85"/></svg>
  )},
  { href: "/dashboard/install", label: "Instalar", icon: (
    <svg width="16" height="16" fill="none" viewBox="0 0 16 16"><path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".85"/><path d="M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".85"/></svg>
  )},
  { href: "/dashboard/settings", label: "Configurações", icon: (
    <svg width="16" height="16" fill="none" viewBox="0 0 16 16"><path d="M8 10a2 2 0 100-4 2 2 0 000 4z" fill="currentColor" opacity=".85"/><path d="M13.3 8a5.3 5.3 0 00-.1-.9l1.4-1.1-1.3-2.3-1.7.7a5.2 5.2 0 00-1.6-.9L9.7 2H6.3l-.3 1.5a5.2 5.2 0 00-1.6.9l-1.7-.7L1.4 6l1.4 1.1A5.3 5.3 0 002.7 8c0 .3 0 .6.1.9L1.4 10l1.3 2.3 1.7-.7c.5.4 1 .7 1.6.9l.3 1.5h3.4l.3-1.5c.6-.2 1.1-.5 1.6-.9l1.7.7 1.3-2.3-1.4-1.1c.1-.3.1-.6.1-.9z" fill="currentColor" opacity=".4"/></svg>
  )},
];

export default function Sidebar({ siteName }: { siteName?: string }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <aside className="w-52 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 h-screen sticky top-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 4C2 3.45 2.45 3 3 3h10c.55 0 1 .45 1 1v6c0 .55-.45 1-1 1H3c-.55 0-1-.45-1-1V4z" fill="white" fillOpacity=".9"/><path d="M4 10.5v2l2.5-2H4z" fill="white"/></svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-tight">Comentei</p>
            {siteName && <p className="text-xs text-gray-400 truncate">{siteName}</p>}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon }) => (
          <Link key={href} href={href}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
              isActive(href)
                ? "bg-indigo-50 text-indigo-700 font-medium"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}>
            <span className={isActive(href) ? "text-indigo-600" : "text-gray-400"}>{icon}</span>
            {label}
          </Link>
        ))}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-gray-100">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-medium text-indigo-700 flex-shrink-0">
            {user?.email?.[0].toUpperCase()}
          </div>
          <p className="text-xs text-gray-500 truncate flex-1 min-w-0">{user?.email}</p>
        </div>
        <button onClick={logout} className="w-full text-left text-xs text-gray-400 hover:text-gray-600 transition px-1">
          Sair
        </button>
      </div>
    </aside>
  );
}
