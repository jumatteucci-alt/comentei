"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Site } from "@/types";

export default function SettingsPage() {
  const { user } = useAuth();
  const [site, setSite] = useState<Site | null>(null);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [color, setColor] = useState("#4f46e5");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "sites", user.uid)).then(snap => {
      if (!snap.exists()) return;
      const s = { id: snap.id, ...snap.data() } as Site;
      setSite(s); setName(s.name); setDomain(s.domain); setColor(s.primaryColor || "#4f46e5");
    });
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateDoc(doc(db, "sites", user!.uid), {
      name: name.trim(),
      domain: domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""),
      primaryColor: color,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (!site) return <div className="flex justify-center py-12"><div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-md mx-auto px-6 py-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Configurações</h1>
      <form onSubmit={handleSave} className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">Nome do site</label>
          <input value={name} onChange={e => setName(e.target.value)} required
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 transition" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">Domínio</label>
          <input value={domain} onChange={e => setDomain(e.target.value)} required
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 transition" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">Cor principal</label>
          <div className="flex items-center gap-3">
            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5" />
            <span className="text-sm text-gray-500">{color}</span>
          </div>
        </div>
        <button type="submit" className="py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition">
          {saved ? "✓ Salvo!" : "Salvar alterações"}
        </button>
      </form>
    </div>
  );
}
