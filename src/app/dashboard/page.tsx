"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { Site } from "@/types";

function generateWidgetId() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

export default function Dashboard() {
  const { user } = useAuth();
  const [site, setSite] = useState<Site | null>(null);
  const [siteLoading, setSiteLoading] = useState(true);
  const [siteName, setSiteName] = useState("");
  const [domain, setDomain] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#4f46e5");
  const [setupError, setSetupError] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);

  const loadSite = useCallback(async () => {
    if (!user) return;
    setSiteLoading(true);
    try {
      const snap = await getDoc(doc(db, "sites", user.uid));
      if (snap.exists()) setSite({ id: snap.id, ...snap.data() } as Site);
    } finally { setSiteLoading(false); }
  }, [user]);

  useEffect(() => { loadSite(); }, [loadSite]);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError(""); setSetupLoading(true);
    try {
      const widgetId = generateWidgetId();
      await setDoc(doc(db, "sites", user!.uid), {
        userId: user!.uid,
        name: siteName.trim(),
        domain: domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""),
        widgetId,
        createdAt: Date.now(),
        primaryColor,
        allowedOrigin: "*",
      });
      await loadSite();
    } catch { setSetupError("Erro ao criar o site. Tente novamente."); }
    finally { setSetupLoading(false); }
  };

  if (siteLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!site) return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Configure seu site</h1>
      <p className="text-gray-500 text-sm mb-8">Em seguida você receberá o código para embeddar em qualquer página.</p>
      <form onSubmit={handleSetup} className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">Nome do site</label>
          <input value={siteName} onChange={e => setSiteName(e.target.value)} required placeholder="Ex: Blog do João"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 transition" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">Domínio</label>
          <input value={domain} onChange={e => setDomain(e.target.value)} required placeholder="meusite.com.br"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 transition" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">Cor principal</label>
          <div className="flex items-center gap-3">
            <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5" />
            <span className="text-sm text-gray-500">{primaryColor}</span>
          </div>
        </div>
        {setupError && <p className="text-red-600 text-xs">{setupError}</p>}
        <button type="submit" disabled={setupLoading} className="py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-60">
          {setupLoading ? "Criando..." : "Criar meu widget"}
        </button>
      </form>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">Visão geral</h1>
        <p className="text-sm text-gray-500 mt-1">{site.domain}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {[
          ["Widget ID", site.widgetId.slice(0,8)+"…"],
          ["Domínio", site.domain],
          ["Cor principal", site.primaryColor || "#4f46e5"],
        ].map(([label, value]) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className="text-sm font-medium text-gray-900 truncate">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { title: "Comentários", desc: "Gerencie os comentários do seu site.", href: "/dashboard/comments" },
          { title: "Popups", desc: "Crie e ative popups com segmentação.", href: "/dashboard/popups" },
          { title: "Leads", desc: "Veja os e-mails capturados pelos popups.", href: "/dashboard/leads" },
          { title: "Instalar", desc: "Snippets de código para embeddar no site.", href: "/dashboard/install" },
        ].map(({ title, desc, href }) => (
          <a key={href} href={href} className="bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm transition group">
            <h3 className="font-medium text-gray-900 mb-1 group-hover:text-indigo-700 transition">{title}</h3>
            <p className="text-sm text-gray-500">{desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
