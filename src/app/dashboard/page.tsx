"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import {
  doc, getDoc, setDoc, collection, query, where,
  orderBy, getDocs, deleteDoc, updateDoc
} from "firebase/firestore";
import { Site, Comment } from "@/types";

function generateWidgetId() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

type Tab = "overview" | "comments" | "settings" | "install";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [site, setSite] = useState<Site | null>(null);
  const [siteLoading, setSiteLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  // Setup form
  const [siteName, setSiteName] = useState("");
  const [domain, setDomain] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#4f46e5");
  const [setupError, setSetupError] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);

  // Settings form
  const [settingsName, setSettingsName] = useState("");
  const [settingsDomain, setSettingsDomain] = useState("");
  const [settingsColor, setSettingsColor] = useState("#4f46e5");
  const [settingsSaved, setSettingsSaved] = useState(false);

  const loadSite = useCallback(async () => {
    if (!user) return;
    setSiteLoading(true);
    try {
      const snap = await getDoc(doc(db, "sites", user.uid));
      if (snap.exists()) {
        const s = { id: snap.id, ...snap.data() } as Site;
        setSite(s);
        setSettingsName(s.name);
        setSettingsDomain(s.domain);
        setSettingsColor(s.primaryColor || "#4f46e5");
      }
    } finally { setSiteLoading(false); }
  }, [user]);

  useEffect(() => { loadSite(); }, [loadSite]);

  const loadComments = useCallback(async () => {
    if (!site) return;
    setCommentsLoading(true);
    try {
      const q = query(
        collection(db, "comments"),
        where("siteId", "==", site.widgetId),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Comment));
      setComments(all);
    } finally { setCommentsLoading(false); }
  }, [site]);

  useEffect(() => {
    if (tab === "comments" && site) loadComments();
  }, [tab, site, loadComments]);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError(""); setSetupLoading(true);
    try {
      const widgetId = generateWidgetId();
      const newSite: Omit<Site, "id"> = {
        userId: user!.uid,
        name: siteName.trim(),
        domain: domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""),
        widgetId,
        createdAt: Date.now(),
        primaryColor,
        allowedOrigin: "*",
      };
      await setDoc(doc(db, "sites", user!.uid), newSite);
      await loadSite();
    } catch { setSetupError("Erro ao criar o site. Tente novamente."); }
    finally { setSetupLoading(false); }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateDoc(doc(db, "sites", user!.uid), {
      name: settingsName.trim(),
      domain: settingsDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""),
      primaryColor: settingsColor,
    });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2500);
    await loadSite();
  };

  const handleDeleteComment = async (id: string) => {
    if (!confirm("Excluir este comentário?")) return;
    await deleteDoc(doc(db, "comments", id));
    setComments(prev => prev.filter(c => c.id !== id));
  };

  const roots = comments.filter(c => !c.parentId);
  const replies = comments.filter(c => !!c.parentId);

  if (siteLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <nav className="bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 4C2 3.45 2.45 3 3 3h10c.55 0 1 .45 1 1v6c0 .55-.45 1-1 1H3c-.55 0-1-.45-1-1V4z" fill="white" fillOpacity=".9"/><path d="M4 10.5v2l2.5-2H4z" fill="white"/></svg>
          </div>
          <span className="font-semibold text-gray-900">Commentful</span>
          {site && <span className="text-gray-400 text-sm ml-2">/ {site.name}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 hidden sm:block">{user?.email}</span>
          <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700">Sair</button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {!site ? (
          /* ── Setup ── */
          <div className="max-w-md mx-auto">
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Configure seu site</h1>
            <p className="text-gray-500 text-sm mb-8">Em seguida você receberá o código para embeddar em qualquer página.</p>
            <form onSubmit={handleSetup} className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Nome do site</label>
                <input value={siteName} onChange={e => setSiteName(e.target.value)} required placeholder="Ex: Blog do João" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 transition" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Domínio</label>
                <input value={domain} onChange={e => setDomain(e.target.value)} required placeholder="meusite.com.br" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 transition" />
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
        ) : (
          /* ── Main dashboard ── */
          <>
            {/* Tabs */}
            <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 mb-6 w-fit">
              {([["overview","Visão geral"],["comments","Comentários"],["install","Instalar"],["settings","Configurações"]] as [Tab,string][]).map(([t,label]) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tab===t ? "bg-indigo-600 text-white" : "text-gray-600 hover:text-gray-900"}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Overview */}
            {tab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[
                    ["Total de comentários", comments.length || "—", "text-indigo-600"],
                    ["Domínio", site.domain, "text-gray-900"],
                    ["Widget ID", site.widgetId.slice(0,8)+"…", "text-gray-900"],
                  ].map(([label, value, cls]) => (
                    <div key={label as string} className="bg-white rounded-xl border border-gray-200 p-4">
                      <p className="text-xs text-gray-400 mb-1">{label as string}</p>
                      <p className={`text-lg font-semibold ${cls}`}>{value as string}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h3 className="font-medium text-gray-900 mb-1">Próximo passo</h3>
                  <p className="text-sm text-gray-500 mb-4">Instale o widget no seu site para começar a receber comentários.</p>
                  <button onClick={() => setTab("install")} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition">
                    Ver instruções de instalação →
                  </button>
                </div>
              </div>
            )}

            {/* Comments */}
            {tab === "comments" && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="font-medium text-gray-900">Comentários</h2>
                  <button onClick={loadComments} className="text-sm text-indigo-600 hover:underline">Atualizar</button>
                </div>
                {commentsLoading ? (
                  <div className="p-8 text-center text-sm text-gray-400">Carregando...</div>
                ) : roots.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-400">Nenhum comentário ainda.</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {roots.map(c => (
                      <div key={c.id} className="px-6 py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-gray-900">{c.name}</span>
                              <span className="text-xs text-gray-400">{c.email}</span>
                              <span className="text-xs text-gray-300">•</span>
                              <span className="text-xs text-gray-400">{c.pageId}</span>
                            </div>
                            <p className="text-sm text-gray-700 leading-relaxed">{c.text}</p>
                            <p className="text-xs text-gray-400 mt-1">{new Date(c.createdAt).toLocaleString("pt-BR")}</p>
                            {replies.filter(r => r.parentId === c.id).map(r => (
                              <div key={r.id} className="mt-3 pl-4 border-l-2 border-gray-100">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-xs font-medium text-gray-700">↳ {r.name}</span>
                                  <span className="text-xs text-gray-400">{r.email}</span>
                                </div>
                                <p className="text-sm text-gray-600">{r.text}</p>
                              </div>
                            ))}
                          </div>
                          <button onClick={() => handleDeleteComment(c.id)} className="text-xs text-red-400 hover:text-red-600 flex-shrink-0 mt-0.5">Excluir</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Install */}
            {tab === "install" && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className="font-medium text-gray-900 mb-1">Seu Widget ID</h2>
                  <p className="text-sm text-gray-500 mb-3">Cole esse ID na inicialização do widget.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-800 overflow-x-auto">{site.widgetId}</code>
                    <button onClick={() => navigator.clipboard.writeText(site.widgetId)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">Copiar</button>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className="font-medium text-gray-900 mb-1">Código de instalação</h2>
                  <p className="text-sm text-gray-500 mb-3">Cole antes do <code className="bg-gray-100 px-1 rounded text-xs">&lt;/body&gt;</code> em qualquer página.</p>
                  <div className="relative">
                    <pre className="bg-gray-900 text-gray-100 rounded-xl p-4 text-xs overflow-x-auto leading-relaxed">{`<!-- 1. Container onde os comentários aparecem -->
<div id="commentful-widget"></div>

<!-- 2. Script do widget -->
<script src="https://commentful.vercel.app/widget.js"></script>

<!-- 3. Inicialização -->
<script>
  Commentful.init({
    widgetId: "${site.widgetId}",
    pageId: "IDENTIFICADOR_DA_PAGINA",
    primaryColor: "${site.primaryColor || "#4f46e5"}"
  });
</script>`}</pre>
                    <button
                      onClick={() => navigator.clipboard.writeText(`<!-- 1. Container -->\n<div id="commentful-widget"></div>\n\n<!-- 2. Script -->\n<script src="https://commentful.vercel.app/widget.js"></script>\n\n<!-- 3. Init -->\n<script>\n  Commentful.init({\n    widgetId: "${site.widgetId}",\n    pageId: "IDENTIFICADOR_DA_PAGINA",\n    primaryColor: "${site.primaryColor || "#4f46e5"}"\n  });\n</script>`)}
                      className="absolute top-3 right-3 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs transition">
                      Copiar
                    </button>
                  </div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm text-amber-800 font-medium mb-1">Sobre o pageId</p>
                  <p className="text-sm text-amber-700">Use uma string única por página — o slug do artigo, a URL, ou qualquer identificador. Isso separa os comentários de cada página dentro do mesmo site.</p>
                </div>
              </div>
            )}

            {/* Settings */}
            {tab === "settings" && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-md">
                <h2 className="font-medium text-gray-900 mb-4">Configurações do site</h2>
                <form onSubmit={handleSaveSettings} className="flex flex-col gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Nome do site</label>
                    <input value={settingsName} onChange={e => setSettingsName(e.target.value)} required className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 transition" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Domínio</label>
                    <input value={settingsDomain} onChange={e => setSettingsDomain(e.target.value)} required className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 transition" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Cor principal</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={settingsColor} onChange={e => setSettingsColor(e.target.value)} className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5" />
                      <span className="text-sm text-gray-500">{settingsColor}</span>
                    </div>
                  </div>
                  <button type="submit" className="py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition">
                    {settingsSaved ? "✓ Salvo!" : "Salvar alterações"}
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
