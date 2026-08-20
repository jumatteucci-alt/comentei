"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Site, ChatConfig } from "@/types";

const DEFAULT_CONFIG: ChatConfig = {
  geminiKey: "",
  assistantName: "Assistente",
  welcomeMessage: "Olá! Como posso te ajudar hoje?",
  primaryColor: "#4f46e5",
  mode: "floating",
  systemPrompt: "Você é um assistente de vendas prestativo e simpático. Responda de forma clara e objetiva. Sempre que possível, direcione o usuário para os produtos relevantes.",
};

export default function ChatConfigPage() {
  const { user } = useAuth();
  const [site, setSite] = useState<Site | null>(null);
  const [config, setConfig] = useState<ChatConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const snap = await getDoc(doc(db, "sites", user.uid));
      if (!snap.exists()) return;
      const s = { id: snap.id, ...snap.data() } as Site;
      setSite(s);
      const cfgSnap = await getDoc(doc(db, "chat_config", s.widgetId));
      if (cfgSnap.exists()) setConfig({ ...DEFAULT_CONFIG, ...cfgSnap.data() as ChatConfig });
      setLoading(false);
    })();
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!site) return;
    setSaving(true);
    await setDoc(doc(db, "chat_config", site.widgetId), { ...config, widgetId: site.widgetId });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const snippet = site ? (config.mode === "floating"
    ? `<script src="https://comentei.vercel.app/chat.js"></script>\n<script>\n  ComenteiChat.init({\n    widgetId: "${site.widgetId}",\n    mode: "floating"\n  });\n</script>`
    : `<div id="comentei-chat"></div>\n<script src="https://comentei.vercel.app/chat.js"></script>\n<script>\n  ComenteiChat.init({\n    widgetId: "${site.widgetId}",\n    mode: "inline",\n    container: "#comentei-chat"\n  });\n</script>`) : "";

  const [copied, setCopied] = useState(false);
  const copySnippet = () => { navigator.clipboard.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  if (loading) return <div className="flex justify-center py-12"><div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Configurações do Chat IA</h1>
        <p className="text-sm text-gray-500 mt-1">Configure o assistente e instale no seu site.</p>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-5">
        {/* API Key */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4">
          <h2 className="font-medium text-gray-900 text-sm">API do Gemini</h2>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Chave da API</label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={config.geminiKey}
                onChange={e => setConfig(c => ({ ...c, geminiKey: e.target.value }))}
                placeholder="AIza..."
                className="w-full px-3 py-2.5 pr-20 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 transition font-mono"
              />
              <button type="button" onClick={() => setShowKey(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600">
                {showKey ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Obtenha sua chave em <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener" className="text-indigo-500 hover:underline">aistudio.google.com</a>. A chave é armazenada de forma segura e nunca exposta no widget.</p>
          </div>
        </div>

        {/* Appearance */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4">
          <h2 className="font-medium text-gray-900 text-sm">Aparência</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Nome do assistente</label>
              <input value={config.assistantName} onChange={e => setConfig(c => ({ ...c, assistantName: e.target.value }))}
                placeholder="Assistente"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 transition" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Cor principal</label>
              <div className="flex items-center gap-2">
                <input type="color" value={config.primaryColor} onChange={e => setConfig(c => ({ ...c, primaryColor: e.target.value }))}
                  className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5" />
                <input type="text" value={config.primaryColor} onChange={e => setConfig(c => ({ ...c, primaryColor: e.target.value }))}
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 transition" />
              </div>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Mensagem inicial</label>
            <input value={config.welcomeMessage} onChange={e => setConfig(c => ({ ...c, welcomeMessage: e.target.value }))}
              placeholder="Olá! Como posso te ajudar hoje?"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 transition" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Modo de exibição</label>
            <div className="flex gap-2">
              {(["floating", "inline"] as const).map(m => (
                <button key={m} type="button" onClick={() => setConfig(c => ({ ...c, mode: m }))}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${config.mode === m ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  {m === "floating" ? "🔵 Bolinha flutuante" : "📦 Embutido na página"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* System prompt */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3">
          <div>
            <h2 className="font-medium text-gray-900 text-sm mb-0.5">Instruções do assistente</h2>
            <p className="text-xs text-gray-400">Define a personalidade e o comportamento do assistente. Os produtos são adicionados automaticamente após essas instruções.</p>
          </div>
          <textarea value={config.systemPrompt} onChange={e => setConfig(c => ({ ...c, systemPrompt: e.target.value }))}
            rows={4} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 transition resize-none" />
        </div>

        <button type="submit" disabled={saving}
          className="py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-60">
          {saving ? "Salvando..." : saved ? "✓ Salvo!" : "Salvar configurações"}
        </button>
      </form>

      {/* Snippet */}
      {site && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3">
          <div>
            <h2 className="font-medium text-gray-900 text-sm mb-0.5">Instalar no site</h2>
            <p className="text-xs text-gray-400">Cole antes do <code className="bg-gray-100 px-1 rounded">&lt;/body&gt;</code>.</p>
          </div>
          <div className="relative">
            <pre className="bg-gray-900 text-gray-100 rounded-xl p-4 text-xs overflow-x-auto leading-relaxed">{snippet}</pre>
            <button onClick={copySnippet} className="absolute top-3 right-3 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs transition">
              {copied ? "Copiado!" : "Copiar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
