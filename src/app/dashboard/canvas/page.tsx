"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db, storage } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, getDocs, deleteDoc, orderBy } from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { Site } from "@/types";
import Link from "next/link";

interface CanvasArt {
  id: string;
  name: string;
  format: string;
  url: string;
  storagePath: string;
  createdAt: number;
}

const FORMATS = [
  { id: "square", label: "Feed", ratio: "1:1", w: 1080, h: 1080, icon: "⬛" },
  { id: "portrait", label: "Stories/Reels", ratio: "9:16", w: 1080, h: 1920, icon: "📱" },
  { id: "landscape", label: "Horizontal", ratio: "16:9", w: 1920, h: 1080, icon: "🖥️" },
];

export default function CanvasPage() {
  const { user } = useAuth();
  const [site, setSite] = useState<Site | null>(null);
  const [arts, setArts] = useState<CanvasArt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFormatPicker, setShowFormatPicker] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const snap = await getDoc(doc(db, "sites", user.uid));
    if (!snap.exists()) return;
    const s = { id: snap.id, ...snap.data() } as Site;
    setSite(s);
    const q = query(collection(db, "canvas_arts"), where("widgetId", "==", s.widgetId), orderBy("createdAt", "desc"));
    const qs = await getDocs(q);
    setArts(qs.docs.map(d => ({ id: d.id, ...d.data() } as CanvasArt)));
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (art: CanvasArt) => {
    if (!confirm("Excluir esta arte?")) return;
    try { await deleteObject(ref(storage, art.storagePath)); } catch {}
    await deleteDoc(doc(db, "canvas_arts", art.id));
    setArts(prev => prev.filter(a => a.id !== art.id));
  };

  if (loading) return <div className="flex justify-center py-12"><div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Canvas</h1>
          <p className="text-sm text-gray-500 mt-1">Crie e salve artes para redes sociais.</p>
        </div>
        <button onClick={() => setShowFormatPicker(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition">
          + Nova arte
        </button>
      </div>

      {/* Format picker modal */}
      {showFormatPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-gray-900">Escolha o formato</h2>
              <button onClick={() => setShowFormatPicker(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="flex flex-col gap-3">
              {FORMATS.map(f => (
                <Link key={f.id} href={`/dashboard/canvas/editor?format=${f.id}`}
                  onClick={() => setShowFormatPicker(false)}
                  className="flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/30 transition group">
                  <span className="text-2xl">{f.icon}</span>
                  <div>
                    <p className="font-medium text-gray-900 text-sm group-hover:text-indigo-700">{f.label}</p>
                    <p className="text-xs text-gray-400">{f.ratio} — {f.w}×{f.h}px</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Gallery */}
      {arts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mx-auto mb-4 text-2xl">🎨</div>
          <h3 className="font-medium text-gray-900 mb-1">Nenhuma arte salva</h3>
          <p className="text-sm text-gray-500 mb-4">Crie sua primeira arte para começar.</p>
          <button onClick={() => setShowFormatPicker(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition">
            Criar arte
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {arts.map(art => (
            <div key={art.id} className="group relative bg-white rounded-xl border border-gray-200 overflow-hidden">
              <img src={art.url} alt={art.name} className="w-full aspect-square object-cover" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                <a href={art.url} download={art.name}
                  className="px-3 py-1.5 bg-white text-gray-800 rounded-lg text-xs font-medium hover:bg-gray-100 transition">
                  Download
                </a>
                <button onClick={() => handleDelete(art)}
                  className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 transition">
                  Excluir
                </button>
              </div>
              <div className="px-3 py-2 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-700 truncate">{art.name}</p>
                <p className="text-xs text-gray-400">{art.format}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
