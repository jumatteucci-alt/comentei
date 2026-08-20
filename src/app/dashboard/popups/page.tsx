"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, query, where } from "firebase/firestore";
import { getPopups, createPopup, deletePopup, updatePopup } from "@/lib/popups";
import { defaultPopup } from "@/lib/popup-defaults";
import { Popup, Site } from "@/types";
import Link from "next/link";

interface PopupStats {
  views: number;
  clicks: number;
}

export default function PopupsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [site, setSite] = useState<Site | null>(null);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [stats, setStats] = useState<Record<string, PopupStats>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const snap = await getDoc(doc(db, "sites", user.uid));
    if (!snap.exists()) { router.push("/dashboard"); return; }
    const s = { id: snap.id, ...snap.data() } as Site;
    setSite(s);

    const ps = await getPopups(s.widgetId);
    setPopups(ps);

    // Load stats for all popups
    if (ps.length > 0) {
      const statsSnap = await getDocs(
        query(collection(db, "popup_stats"), where("widgetId", "==", s.widgetId))
      );
      const statsMap: Record<string, PopupStats> = {};
      statsSnap.docs.forEach(d => {
        const data = d.data();
        statsMap[d.id] = { views: data.views || 0, clicks: data.clicks || 0 };
      });
      setStats(statsMap);
    }

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

  const ctr = (s?: PopupStats) => {
    if (!s || s.views === 0) return "—";
    return ((s.clicks / s.views) * 100).toFixed(1) + "%";
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Popups</h1>
          <p className="text-sm text-gray-500 mt-0.5">{popups.length} popup{popups.length !== 1 ? "s" : ""}</p>
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
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_90px_90px_70px_200px] gap-2 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-400">
            <span>Nome</span>
            <span className="text-center">Exibições</span>
            <span className="text-center">Cliques</span>
            <span className="text-center">CTR</span>
            <span></span>
          </div>

          <div className="divide-y divide-gray-100">
            {popups.map(p => {
              const s = stats[p.id];
              return (
                <div key={p.id} className="grid grid-cols-[1fr_90px_90px_70px_200px] gap-2 px-5 py-4 items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">{p.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${p.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {p.active ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">{triggerLabel(p)}</span>
                  </div>

                  <div className="text-center">
                    <span className="text-sm font-semibold text-gray-800">{s?.views?.toLocaleString("pt-BR") ?? "—"}</span>
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-semibold text-gray-800">{s?.clicks?.toLocaleString("pt-BR") ?? "—"}</span>
                  </div>
                  <div className="text-center">
                    <span className={`text-sm font-semibold ${s && s.views > 0 ? "text-indigo-600" : "text-gray-400"}`}>{ctr(s)}</span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => handleToggle(p)}
                      className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition ${p.active ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}>
                      {p.active ? "Pausar" : "Ativar"}
                    </button>
                    <Link href={`/dashboard/popups/${p.id}`}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition font-medium">
                      Editar
                    </Link>
                    <button onClick={() => handleDelete(p.id)}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-red-100 text-red-400 hover:bg-red-50 transition font-medium">
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
