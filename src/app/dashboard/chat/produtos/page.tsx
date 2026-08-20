"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, orderBy } from "firebase/firestore";
import { Site, ChatProduct } from "@/types";

const EMPTY: Omit<ChatProduct, "id" | "createdAt"> = { name: "", description: "", price: "", link: "" };

export default function ChatProductsPage() {
  const { user } = useAuth();
  const [site, setSite] = useState<Site | null>(null);
  const [products, setProducts] = useState<ChatProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ChatProduct | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const snap = await getDoc(doc(db, "sites", user.uid));
    if (!snap.exists()) return;
    const s = { id: snap.id, ...snap.data() } as Site;
    setSite(s);
    const q = query(collection(db, "chat_products"), where("widgetId", "==", s.widgetId), orderBy("createdAt", "asc"));
    const ps = await getDocs(q);
    setProducts(ps.docs.map(d => ({ id: d.id, ...d.data() } as ChatProduct)));
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm(EMPTY); setShowForm(true); };
  const openEdit = (p: ChatProduct) => { setEditing(p); setForm({ name: p.name, description: p.description, price: p.price, link: p.link }); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditing(null); setForm(EMPTY); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!site) return;
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, "chat_products", editing.id), { ...form });
        setProducts(prev => prev.map(p => p.id === editing.id ? { ...p, ...form } : p));
      } else {
        const ref = await addDoc(collection(db, "chat_products"), { ...form, widgetId: site.widgetId, createdAt: Date.now() });
        setProducts(prev => [...prev, { id: ref.id, ...form, widgetId: site.widgetId, createdAt: Date.now() }]);
      }
      closeForm();
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este produto?")) return;
    await deleteDoc(doc(db, "chat_products", id));
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  const field = (label: string, key: keyof typeof form, placeholder: string, type = "text") => (
    <div key={key}>
      <label className="text-sm font-medium text-gray-700 block mb-1.5">{label}</label>
      {key === "description" ? (
        <textarea value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder} rows={3}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 transition resize-none" />
      ) : (
        <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 transition" />
      )}
    </div>
  );

  if (loading) return <div className="flex justify-center py-12"><div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Produtos</h1>
          <p className="text-sm text-gray-500 mt-1">O assistente usa essas informações para responder os visitantes.</p>
        </div>
        <button onClick={openNew} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition">
          + Adicionar produto
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 w-full max-w-md mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-gray-900">{editing ? "Editar produto" : "Novo produto"}</h2>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              {field("Nome", "name", "Ex: Curso Value Investing")}
              {field("Descrição", "description", "Descreva o produto, o que está incluso, para quem é...")}
              {field("Preço", "price", "Ex: R$ 997 ou 12x R$ 97")}
              {field("Link", "link", "https://...")}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={closeForm} className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-60">
                  {saving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {products.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M20 7H4a1 1 0 00-1 1v10a1 1 0 001 1h16a1 1 0 001-1V8a1 1 0 00-1-1z" stroke="#4f46e5" strokeWidth="1.5"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" stroke="#4f46e5" strokeWidth="1.5"/></svg>
          </div>
          <h3 className="font-medium text-gray-900 mb-1">Nenhum produto cadastrado</h3>
          <p className="text-sm text-gray-500 mb-4">Adicione seus produtos para que o assistente possa responder sobre eles.</p>
          <button onClick={openNew} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition">
            Adicionar produto
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {products.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 text-sm">{p.name}</span>
                    {p.price && <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{p.price}</span>}
                  </div>
                  {p.description && <p className="text-sm text-gray-500 line-clamp-2 mb-1">{p.description}</p>}
                  {p.link && <a href={p.link} target="_blank" rel="noopener" className="text-xs text-indigo-500 hover:underline truncate block">{p.link}</a>}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => openEdit(p)} className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition">Editar</button>
                  <button onClick={() => handleDelete(p.id)} className="text-xs px-3 py-1.5 border border-red-100 text-red-400 rounded-lg hover:bg-red-50 transition">Excluir</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
