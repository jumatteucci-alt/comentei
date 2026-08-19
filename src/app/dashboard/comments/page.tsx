"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, orderBy, getDocs, deleteDoc } from "firebase/firestore";
import { Site, Comment } from "@/types";

export default function CommentsPage() {
  const { user } = useAuth();
  const [site, setSite] = useState<Site | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const snap = await getDoc(doc(db, "sites", user.uid));
    if (!snap.exists()) return;
    const s = { id: snap.id, ...snap.data() } as Site;
    setSite(s);
    const q = query(collection(db, "comments"), where("siteId", "==", s.widgetId), orderBy("createdAt", "desc"));
    const cs = await getDocs(q);
    setComments(cs.docs.map(d => ({ id: d.id, ...d.data() } as Comment)));
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este comentário?")) return;
    await deleteDoc(doc(db, "comments", id));
    setComments(prev => prev.filter(c => c.id !== id));
  };

  const roots = comments.filter(c => !c.parentId);
  const replies = comments.filter(c => !!c.parentId);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Comentários</h1>
          <p className="text-sm text-gray-500 mt-1">{comments.length} no total</p>
        </div>
        <button onClick={load} className="text-sm text-indigo-600 hover:underline">Atualizar</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : roots.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">Nenhum comentário ainda.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {roots.map(c => (
            <div key={c.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{c.name}</span>
                    <span className="text-xs text-gray-400">{c.email}</span>
                    <span className="text-xs text-gray-300">•</span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{c.pageId}</span>
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
                <button onClick={() => handleDelete(c.id)} className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
