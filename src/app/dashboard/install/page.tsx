"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect, useCallback } from "react";
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

export default function InstallPage() {
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
    <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Instalar</h1>
        <p className="text-sm text-gray-500 mt-1">Cole os snippets antes do <code className="bg-gray-100 px-1 rounded text-xs">&lt;/body&gt;</code> nas páginas onde quiser ativar cada recurso.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3">
        <div>
          <h2 className="font-medium text-gray-900 text-sm mb-0.5">Widget de Comentários</h2>
          <p className="text-xs text-gray-400 mb-3">Adiciona a seção de comentários em qualquer página. Mude o <code className="bg-gray-100 px-1 rounded">pageId</code> por página.</p>
        </div>
        <CodeBlock code={`<div id="commentful-widget"></div>\n<script src="https://comentei.vercel.app/widget.js"></script>\n<script>\n  Commentful.init({\n    widgetId: "${site.widgetId}",\n    pageId: "IDENTIFICADOR_DA_PAGINA"\n  });\n</script>`} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3">
        <div>
          <h2 className="font-medium text-gray-900 text-sm mb-0.5">Popups</h2>
          <p className="text-xs text-gray-400 mb-3">Carrega todos os popups ativos do seu site automaticamente.</p>
        </div>
        <CodeBlock code={`<script src="https://comentei.vercel.app/popup.js"></script>\n<script>\n  ComenteiPopup.init({ widgetId: "${site.widgetId}" });\n</script>`} />
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-sm text-amber-800 font-medium mb-1">Widget ID</p>
        <p className="text-sm text-amber-700 mb-2">Use esse ID em qualquer integração ou chamada à API.</p>
        <code className="text-sm font-mono text-amber-900 bg-amber-100 px-2 py-1 rounded">{site.widgetId}</code>
      </div>
    </div>
  );
}
