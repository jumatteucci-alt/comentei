"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Site } from "@/types";

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="bg-gray-900 text-gray-100 rounded-xl p-4 text-xs overflow-x-auto leading-relaxed">{code}</pre>
      <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="absolute top-3 right-3 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs transition">
        {copied ? "Copiado!" : "Copiar"}
      </button>
    </div>
  );
}

export default function PopupsInstallPage() {
  const { user } = useAuth();
  const [site, setSite] = useState<Site | null>(null);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "sites", user.uid)).then(snap => {
      if (snap.exists()) setSite({ id: snap.id, ...snap.data() } as Site);
    });
  }, [user]);

  if (!site) return <div className="flex justify-center py-12"><div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Instalar popups</h1>
        <p className="text-sm text-gray-500 mt-1">Cole antes do <code className="bg-gray-100 px-1 rounded text-xs">&lt;/body&gt;</code>. Todos os popups ativos carregam automaticamente.</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3">
        <CodeBlock code={`<script src="https://comentei.vercel.app/popup.js"></script>\n<script>\n  ComenteiPopup.init({ widgetId: "${site.widgetId}" });\n</script>`} />
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-800 font-medium mb-1">Dica</p>
        <p className="text-sm text-blue-700">Você pode instalar em todas as páginas de uma vez e controlar onde cada popup aparece usando a aba Público no editor.</p>
      </div>
    </div>
  );
}
