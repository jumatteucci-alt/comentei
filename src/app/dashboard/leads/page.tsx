"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Site } from "@/types";

interface Lead {
  id: string;
  email: string;
  popupId: string | null;
  createdAt: number;
  source: string;
}

export default function LeadsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [site, setSite] = useState<Site | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    const snap = await getDoc(doc(db, "sites", user.uid));
    if (!snap.exists()) { router.push("/dashboard"); return; }
    const s = { id: snap.id, ...snap.data() } as Site;
    setSite(s);

    const res = await fetch(`/api/leads?widgetId=${s.widgetId}`);
    const data = await res.json();
    if (data.ok) setLeads(data.data);
    setLoading(false);
  }, [user, router]);

  useEffect(() => { load(); }, [load]);

  const filtered = leads.filter(l => l.email.includes(search.toLowerCase()));

  const exportCSV = () => {
    const rows = [["E-mail","Data","Popup ID"], ...filtered.map(l => [l.email, new Date(l.createdAt).toLocaleString("pt-BR"), l.popupId || ""])];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = "leads.csv";
    a.click();
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Leads capturados</h1>
            <p className="text-sm text-gray-500 mt-0.5">{leads.length} lead{leads.length !== 1 ? "s" : ""} no total</p>
          </div>
          <button onClick={exportCSV} disabled={leads.length === 0}
            className="px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition disabled:opacity-40">
            ↓ Exportar CSV
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <input
              type="text" placeholder="Buscar por e-mail..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">
              {leads.length === 0 ? "Nenhum lead capturado ainda. Ative um popup com bloco de e-mail para começar." : "Nenhum resultado para essa busca."}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              <div className="grid grid-cols-3 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-400">
                <span>E-mail</span><span>Origem</span><span>Data</span>
              </div>
              {filtered.map(lead => (
                <div key={lead.id} className="grid grid-cols-3 px-4 py-3 text-sm items-center">
                  <span className="text-gray-800 font-medium">{lead.email}</span>
                  <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5 w-fit">
                    {lead.popupId ? `popup` : "direto"}
                  </span>
                  <span className="text-gray-400 text-xs">{new Date(lead.createdAt).toLocaleString("pt-BR")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
    </div>
  );
}
