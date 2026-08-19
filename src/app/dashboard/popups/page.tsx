"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { getPopups, createPopup, deletePopup, updatePopup } from "@/lib/popups";
import { defaultPopup } from "@/lib/popup-defaults";
import { Popup, Site } from "@/types";
import Link from "next/link";

export default function PopupsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [site, setSite] = useState<Site | null>(null);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const snap = await getDoc(doc(db, "sites", user.uid));
    if (!snap.exists()) { router.push("/dashboard"); return; }
    const s = { id: snap.id, ...snap.data() } as Site;
    setSite(s);
    const ps = await getPopups(s.widgetId);
    setPopups(ps);
    setLoading(false);
  }, [user, router]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!site) return;
    const id = await createPopup(defaultPopup(site.widgetId));
    router.push(`/dashboard/popups/${id}`);
  };

  const handleToggle = async (p: Popup) => {
    await updatePopup(p.id, { active: !p.active });
    setPopups(prev => prev.map(x => x.id === p.id ? { ...x, active: !x.active } : x));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este popup?")) return;
    await deletePopup(id);
    setPopups(prev => prev.filter(p => p.id !== id));
  };

  const triggerLabel = (p: Popup) => {
    if (p.trigger.type === "delay") return `Após ${p.trigger.delaySeconds}s`;
    if (p.trigger.type === "scroll") return `Scroll ${p.trigger.scrollPercent}%`;
    return "Exit intent";
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 4C2 3.45 2.45 3 3 3h10c.55 0 1 .45 1 1v6c0 .55-.45 1-1 1H3c-.55 0-1-.45-1-1V4z" fill="white" fillOpacity=".9"/><path d="M4 10.5v2l2.5-2H4z" fill="white"/></svg>
          </div>
          <Link href="/dashboard" className="font-semibold text-gray-900">Comentei</Link>
          <span className="text-gray-400 text-sm">/ Popups</span>
        </div>
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Voltar</Link>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Popups</h1>
            <p className="text-sm text-gray-500 mt-0.5">{popups.length} popup{popups.length !== 1 ? "s" : ""} criado{popups.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={handleCreate} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition">
            + Novo popup
          </button>
        </div>

        {popups.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" stroke="#4f46e5" strokeWidth="1.5"/><path d="M8 12h8M12 8v8" stroke="#4f46e5" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </div>
            <h3 className="font-medium text-gray-900 mb-1">Nenhum popup ainda</h3>
            <p className="text-sm text-gray-500 mb-4">Crie seu primeiro popup e instale com uma linha de código.</p>
            <button onClick={handleCreate} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition">
              Criar popup
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {popups.map(p => (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-gray-900 text-sm">{p.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {p.active ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{triggerLabel(p)}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleToggle(p)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition ${p.active ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}>
                    {p.active ? "Pausar" : "Ativar"}
                  </button>
                  <Link href={`/dashboard/popups/${p.id}`} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition font-medium">
                    Editar
                  </Link>
                  <button onClick={() => handleDelete(p.id)} className="text-xs px-3 py-1.5 rounded-lg border border-red-100 text-red-400 hover:bg-red-50 transition font-medium">
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Install snippet */}
        {site && (
          <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-medium text-gray-900 mb-1">Instalar popups no site</h3>
            <p className="text-sm text-gray-500 mb-3">Cole antes do <code className="bg-gray-100 px-1 rounded text-xs">&lt;/body&gt;</code>. Todos os popups ativos do seu site serão carregados automaticamente.</p>
            <div className="relative">
              <pre className="bg-gray-900 text-gray-100 rounded-xl p-4 text-xs overflow-x-auto leading-relaxed">{`<script src="https://comentei.vercel.app/popup.js"></script>\n<script>\n  ComenteiPopup.init({ widgetId: "${site.widgetId}" });\n</script>`}</pre>
              <button
                onClick={() => navigator.clipboard.writeText(`<script src="https://comentei.vercel.app/popup.js"></script>\n<script>\n  ComenteiPopup.init({ widgetId: "${site.widgetId}" });\n</script>`)}
                className="absolute top-3 right-3 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs transition">
                Copiar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
