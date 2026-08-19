"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getPopup, updatePopup } from "@/lib/popups";
import { defaultBlock, defaultRow, defaultColumn } from "@/lib/popup-defaults";
import { storage } from "@/lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import {
  Popup, PopupRow, PopupColumn, Block, BlockType,
  ImageBlock, TitleBlock, TextBlock, ButtonBlock, CountdownBlock, EmailInputBlock,
  PopupCondition, PopupSegmentation, ConditionType, ConditionOperator
} from "@/types";
import Link from "next/link";

function uid() { return Math.random().toString(36).slice(2, 10); }

// ── Image uploader ──
function ImageUploader({ userId, onUploaded }: { userId: string; onUploaded: (url: string) => void }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) { setError("Selecione uma imagem."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Máximo 5MB."); return; }
    setError(""); setProgress(0);
    const storageRef = ref(storage, `popups/${userId}/${Date.now()}-${file.name}`);
    const task = uploadBytesResumable(storageRef, file);
    task.on("state_changed",
      snap => setProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
      () => { setError("Erro no upload."); setProgress(null); },
      () => { getDownloadURL(task.snapshot.ref).then(url => { onUploaded(url); setProgress(null); }); }
    );
  };

  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">Upload de imagem</label>
      <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition">
        <span className="text-xs text-gray-400">{progress !== null ? `${progress}%` : "Clique ou arraste"}</span>
        <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </label>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ── Block renderer (preview) ──
function BlockPreview({ block, selected, onClick }: { block: Block; selected: boolean; onClick: () => void }) {
  const base = `relative cursor-pointer rounded transition ${selected ? "ring-2 ring-indigo-500 ring-offset-1" : "hover:ring-1 hover:ring-indigo-300"}`;

  const inner = () => {
    switch (block.type) {
      case "image":
        return block.src
          ? <img src={block.src} alt={block.alt} style={{ width: block.width, borderRadius: block.borderRadius }} className="block mx-auto" />
          : <div className="w-full h-24 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs">Imagem</div>;
      case "title":
        return <p style={{ fontSize: block.fontSize, color: block.color, textAlign: block.align, fontWeight: block.fontWeight }} className="py-1 w-full break-words">{block.text || "Título"}</p>;
      case "text":
        return <p style={{ fontSize: block.fontSize, color: block.color, textAlign: block.align }} className="py-1 w-full break-words whitespace-pre-wrap">{block.text || "Texto"}</p>;
      case "button":
        return (
          <div style={{ textAlign: block.align }}>
            <span style={{ background: block.backgroundColor, color: block.color, fontSize: block.fontSize, borderRadius: block.borderRadius, display: block.fullWidth ? "block" : "inline-block", textAlign: "center" }} className="px-5 py-2 cursor-default select-none">
              {block.label || "Botão"}
            </span>
          </div>
        );
      case "countdown":
        return <div style={{ fontSize: block.fontSize, color: block.color, textAlign: block.align }} className="font-mono py-1">00 : 00 : 00</div>;
      case "email-input":
        return (
          <div className="flex gap-2">
            <input readOnly placeholder={block.placeholder} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50" />
            <button style={{ background: block.buttonColor, color: block.buttonTextColor }} className="px-3 py-2 rounded-lg text-sm whitespace-nowrap">{block.buttonLabel}</button>
          </div>
        );
    }
  };

  return (
    <div className={base} onClick={onClick}>
      {inner()}
      {selected && <div className="absolute -top-2 -right-2 w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center"><svg width="8" height="8" fill="white" viewBox="0 0 8 8"><path d="M1 4h6M4 1v6" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg></div>}
    </div>
  );
}

// ── Block config panel ──
function BlockConfig({ block, onChange, onDelete, userId }: { block: Block; onChange: (b: Block) => void; onDelete: () => void; userId: string }) {
  const input = (label: string, value: string, key: string, type = "text") => (
    <div key={key}>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange({ ...block, [key]: e.target.value } as Block)}
        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400" />
    </div>
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = block as any;
  const colorField = (label: string, key: string) => (
    <div key={key}>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <div className="flex gap-2 items-center">
        <input type="color" value={b[key]} onChange={e => onChange({ ...block, [key]: e.target.value } as Block)} className="w-8 h-8 rounded border border-gray-200 p-0.5 cursor-pointer" />
        <input type="text" value={b[key]} onChange={e => onChange({ ...block, [key]: e.target.value } as Block)} className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400" />
      </div>
    </div>
  );
  const select = (label: string, key: string, options: [string,string][]) => (
    <div key={key}>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <select value={b[key]} onChange={e => onChange({ ...block, [key]: e.target.value } as Block)}
        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 bg-white">
        {options.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
  const toggle = (label: string, key: string) => (
    <div key={key} className="flex items-center justify-between">
      <label className="text-xs text-gray-500">{label}</label>
      <button onClick={() => onChange({ ...block, [key]: !b[key] } as Block)}
        className={`w-9 h-5 rounded-full transition ${b[key] ? "bg-indigo-500" : "bg-gray-200"}`}>
        <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${b[key] ? "translate-x-4" : ""}`} />
      </button>
    </div>
  );
  const textarea = (label: string, key: string) => (
    <div key={key}>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <textarea value={b[key]} onChange={e => onChange({ ...block, [key]: e.target.value } as Block)} rows={3}
        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 resize-none" />
    </div>
  );

  const typeLabels: Record<BlockType, string> = { image: "Imagem", title: "Título", text: "Texto", button: "Botão", countdown: "Countdown", "email-input": "Captura de e-mail" };
  const alignOptions: [string,string][] = [["left","Esquerda"],["center","Centro"],["right","Direita"]];

  const fields = () => {
    switch (block.type) {
      case "image": return [
        <ImageUploader key="upload" userId={userId} onUploaded={url => onChange({ ...block, src: url } as Block)} />,
        input("URL da imagem", (block as ImageBlock).src, "src"),
        input("Texto alternativo", (block as ImageBlock).alt, "alt"),
        input("Largura", (block as ImageBlock).width, "width"),
        input("Border radius", (block as ImageBlock).borderRadius, "borderRadius"),
      ];
      case "title": return [textarea("Texto","text"), input("Tamanho da fonte",(block as TitleBlock).fontSize,"fontSize"), colorField("Cor","color"), select("Alinhamento","align",alignOptions), select("Peso","fontWeight",[["400","Normal"],["600","Semibold"],["700","Bold"]])];
      case "text": return [textarea("Texto","text"), input("Tamanho da fonte",(block as TextBlock).fontSize,"fontSize"), colorField("Cor","color"), select("Alinhamento","align",alignOptions)];
      case "button": return [input("Label",(block as ButtonBlock).label,"label"), input("URL",(block as ButtonBlock).url,"url"), toggle("Abrir em nova aba","openInNewTab"), colorField("Cor de fundo","backgroundColor"), colorField("Cor do texto","color"), input("Tamanho da fonte",(block as ButtonBlock).fontSize,"fontSize"), input("Border radius",(block as ButtonBlock).borderRadius,"borderRadius"), select("Alinhamento","align",alignOptions), toggle("Largura total","fullWidth")];
      case "countdown": return [input("Data alvo",(block as CountdownBlock).targetDate,"targetDate","datetime-local"), input("Texto ao expirar",(block as CountdownBlock).expiredText,"expiredText"), colorField("Cor","color"), input("Tamanho da fonte",(block as CountdownBlock).fontSize,"fontSize"), select("Alinhamento","align",alignOptions)];
      case "email-input": return [input("Placeholder",(block as EmailInputBlock).placeholder,"placeholder"), input("Label do botão",(block as EmailInputBlock).buttonLabel,"buttonLabel"), colorField("Cor do botão","buttonColor"), colorField("Cor do texto do botão","buttonTextColor"), input("Mensagem de sucesso",(block as EmailInputBlock).successMessage,"successMessage"), input("Webhook URL (opcional)",(block as EmailInputBlock).webhookUrl,"webhookUrl")];
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-800">{typeLabels[block.type]}</span>
        <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600">Remover</button>
      </div>
      <div className="flex flex-col gap-3">{fields()}</div>
    </div>
  );
}


// ── Segmentation panel ──
const CONDITION_LABELS: Record<ConditionType, string> = {
  url_contains: "URL contém",
  url_equals: "URL é exatamente",
  url_starts_with: "URL começa com",
  url_not_contains: "URL não contém",
  cookie_equals: "Cookie igual a",
  cookie_contains: "Cookie contém",
  cookie_exists: "Cookie existe",
  cookie_not_exists: "Cookie não existe",
  utm_source: "UTM source igual a",
  utm_medium: "UTM medium igual a",
  utm_campaign: "UTM campaign igual a",
  device_is: "Dispositivo é",
};

const NEEDS_KEY: ConditionType[] = ["cookie_equals", "cookie_contains", "cookie_exists", "cookie_not_exists"];
const DEVICE_OPTIONS = ["desktop", "mobile", "tablet"];
const NO_VALUE: ConditionType[] = ["cookie_exists", "cookie_not_exists"];

function SegmentationPanel({ seg, onChange }: { seg: PopupSegmentation; onChange: (s: PopupSegmentation) => void }) {
  const addCondition = () => {
    const c: PopupCondition = { id: Math.random().toString(36).slice(2,8), type: "url_contains", value: "" };
    onChange({ ...seg, conditions: [...seg.conditions, c] });
  };
  const removeCondition = (id: string) => onChange({ ...seg, conditions: seg.conditions.filter(c => c.id !== id) });
  const updateCondition = (updated: PopupCondition) => onChange({ ...seg, conditions: seg.conditions.map(c => c.id === updated.id ? updated : c) });

  return (
    <div className="p-3 flex flex-col gap-3">
      <div>
        <p className="text-xs font-medium text-gray-700 mb-2">Regras de exibição</p>
        <p className="text-xs text-gray-400 mb-3">O popup só aparece quando as condições abaixo forem satisfeitas.</p>
        {seg.conditions.length > 1 && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-gray-500">Combinar com:</span>
            <div className="flex rounded-lg overflow-hidden border border-gray-200">
              {(["and","or"] as ConditionOperator[]).map(op => (
                <button key={op} onClick={() => onChange({ ...seg, operator: op })}
                  className={`px-3 py-1 text-xs font-medium transition ${seg.operator === op ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                  {op === "and" ? "E (todas)" : "OU (qualquer)"}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {seg.conditions.map((cond, i) => (
            <div key={cond.id} className="bg-gray-50 rounded-lg p-2.5 flex flex-col gap-2">
              {i > 0 && <div className="text-xs text-center text-gray-400 font-medium">{seg.operator === "and" ? "E" : "OU"}</div>}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">Condição {i+1}</span>
                <button onClick={() => removeCondition(cond.id)} className="text-xs text-red-400 hover:text-red-600">Remover</button>
              </div>
              <select value={cond.type} onChange={e => updateCondition({ ...cond, type: e.target.value as ConditionType, key: undefined, value: "" })}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-indigo-400">
                {(Object.keys(CONDITION_LABELS) as ConditionType[]).map(t => (
                  <option key={t} value={t}>{CONDITION_LABELS[t]}</option>
                ))}
              </select>
              {NEEDS_KEY.includes(cond.type) && (
                <input placeholder="Nome do cookie" value={cond.key || ""} onChange={e => updateCondition({ ...cond, key: e.target.value })}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400" />
              )}
              {!NO_VALUE.includes(cond.type) && (
                cond.type === "device_is" ? (
                  <select value={cond.value} onChange={e => updateCondition({ ...cond, value: e.target.value })}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-indigo-400">
                    <option value="">Selecione...</option>
                    {DEVICE_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                ) : (
                  <input placeholder="Valor" value={cond.value} onChange={e => updateCondition({ ...cond, value: e.target.value })}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400" />
                )
              )}
            </div>
          ))}
        </div>
        <button onClick={addCondition} className="mt-3 w-full py-1.5 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition">
          + Adicionar condição
        </button>
      </div>
    </div>
  );
}
// ── Main editor ──
export default function PopupEditor() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [popup, setPopup] = useState<Popup | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedColId, setSelectedColId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"editor" | "settings" | "segmentation">("editor");
  const dragItem = useRef<{ rowId: string; colId: string; blockId: string } | null>(null);
  const dragOver = useRef<{ rowId: string; colId: string; index: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    getPopup(id).then(p => { if (p) setPopup(p); setLoading(false); });
  }, [id, user]);

  const save = useCallback(async (p: Popup) => {
    setSaving(true);
    await updatePopup(p.id, p);
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, []);

  const update = (p: Popup) => { setPopup(p); };

  // ── Row/column ops ──
  const addRow = (layout: 1|2|3) => {
    if (!popup) return;
    const row = defaultRow(layout);
    update({ ...popup, rows: [...popup.rows, row] });
  };

  const removeRow = (rowId: string) => {
    if (!popup) return;
    update({ ...popup, rows: popup.rows.filter(r => r.id !== rowId) });
  };

  const moveRow = (rowId: string, dir: -1|1) => {
    if (!popup) return;
    const rows = [...popup.rows];
    const i = rows.findIndex(r => r.id === rowId);
    if (i + dir < 0 || i + dir >= rows.length) return;
    [rows[i], rows[i+dir]] = [rows[i+dir], rows[i]];
    update({ ...popup, rows });
  };

  // ── Block ops ──
  const addBlock = (rowId: string, colId: string, type: BlockType) => {
    if (!popup) return;
    const b = defaultBlock(type);
    const rows = popup.rows.map(r => r.id !== rowId ? r : {
      ...r, columns: r.columns.map(c => c.id !== colId ? c : { ...c, blocks: [...c.blocks, b] })
    });
    update({ ...popup, rows });
    setSelectedBlockId(b.id);
  };

  const updateBlock = (rowId: string, colId: string, block: Block) => {
    if (!popup) return;
    const rows = popup.rows.map(r => r.id !== rowId ? r : {
      ...r, columns: r.columns.map(c => c.id !== colId ? c : {
        ...c, blocks: c.blocks.map(b => b.id === block.id ? block : b)
      })
    });
    update({ ...popup, rows });
  };

  const removeBlock = (rowId: string, colId: string, blockId: string) => {
    if (!popup) return;
    const rows = popup.rows.map(r => r.id !== rowId ? r : {
      ...r, columns: r.columns.map(c => c.id !== colId ? c : {
        ...c, blocks: c.blocks.filter(b => b.id !== blockId)
      })
    });
    update({ ...popup, rows });
    setSelectedBlockId(null);
  };

  const updateColumn = (rowId: string, col: PopupColumn) => {
    if (!popup) return;
    const rows = popup.rows.map(r => r.id !== rowId ? r : {
      ...r, columns: r.columns.map(c => c.id === col.id ? col : c)
    });
    update({ ...popup, rows });
  };

  // ── Drag to reorder blocks ──
  const onDragStart = (rowId: string, colId: string, blockId: string) => {
    dragItem.current = { rowId, colId, blockId };
  };
  const onDragOverBlock = (rowId: string, colId: string, index: number) => {
    dragOver.current = { rowId, colId, index };
  };
  const onDrop = () => {
    if (!popup || !dragItem.current || !dragOver.current) return;
    const { rowId: sr, colId: sc, blockId } = dragItem.current;
    const { rowId: dr, colId: dc, index: di } = dragOver.current;
    let block: Block | null = null;
    let rows = popup.rows.map(r => r.id !== sr ? r : {
      ...r, columns: r.columns.map(c => {
        if (c.id !== sc) return c;
        block = c.blocks.find(b => b.id === blockId) || null;
        return { ...c, blocks: c.blocks.filter(b => b.id !== blockId) };
      })
    });
    if (!block) return;
    const finalBlock = block;
    rows = rows.map(r => r.id !== dr ? r : {
      ...r, columns: r.columns.map(c => {
        if (c.id !== dc) return c;
        const bs = [...c.blocks];
        bs.splice(di, 0, finalBlock);
        return { ...c, blocks: bs };
      })
    });
    update({ ...popup, rows });
    dragItem.current = null; dragOver.current = null;
  };

  // ── Find selected block ──
  const selectedContext = (() => {
    if (!popup || !selectedBlockId) return null;
    for (const row of popup.rows) {
      for (const col of row.columns) {
        const block = col.blocks.find(b => b.id === selectedBlockId);
        if (block) return { rowId: row.id, colId: col.id, block };
      }
    }
    return null;
  })();

  const selectedColumn = (() => {
    if (!popup || !selectedColId) return null;
    for (const row of popup.rows) {
      const col = row.columns.find(c => c.id === selectedColId);
      if (col) return { rowId: row.id, col };
    }
    return null;
  })();

  const BLOCK_TYPES: [BlockType, string][] = [
    ["title","Título"], ["text","Texto"], ["image","Imagem"],
    ["button","Botão"], ["countdown","Countdown"], ["email-input","E-mail"],
  ];

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!popup) return <div className="p-8 text-center text-gray-500">Popup não encontrado.</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <nav className="bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/popups" className="text-sm text-gray-500 hover:text-gray-700">← Popups</Link>
          <input value={popup.name} onChange={e => update({ ...popup, name: e.target.value })}
            className="text-sm font-medium text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-indigo-400 focus:outline-none px-1 py-0.5 min-w-[120px]" />
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${saving ? "text-gray-400" : saved ? "text-green-600" : "text-transparent"}`}>{saving ? "Salvando..." : "Salvo!"}</span>
          <button onClick={() => update({ ...popup, active: !popup.active })}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition ${popup.active ? "border-green-200 bg-green-50 text-green-700" : "border-gray-200 text-gray-500"}`}>
            {popup.active ? "● Ativo" : "○ Inativo"}
          </button>
          <button onClick={() => save(popup)} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
            Salvar
          </button>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — blocks palette + row controls */}
        <div className="w-56 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 overflow-y-auto">
          <div className="p-3 border-b border-gray-100">
            <div className="flex rounded-lg overflow-hidden border border-gray-200">
              <button onClick={() => setActiveTab("editor")} className={`flex-1 py-1.5 text-xs font-medium transition ${activeTab==="editor" ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>Editor</button>
              <button onClick={() => setActiveTab("settings")} className={`flex-1 py-1.5 text-xs font-medium transition ${activeTab==="settings" ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>Estilo</button>
              <button onClick={() => setActiveTab("segmentation")} className={`flex-1 py-1.5 text-xs font-medium transition ${activeTab==="segmentation" ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>Público</button>
            </div>
          </div>

          {activeTab === "editor" ? (
            <>
              <div className="p-3 border-b border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">Adicionar linha</p>
                <div className="flex flex-col gap-1.5">
                  {([1,2,3] as const).map(n => (
                    <button key={n} onClick={() => addRow(n)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition text-xs text-gray-600">
                      <div className="flex gap-0.5">
                        {Array.from({length:n}).map((_,i) => <div key={i} className="bg-gray-300 rounded-sm" style={{width: n===1?28: n===2?13:8, height:12}} />)}
                      </div>
                      {n} coluna{n>1?"s":""}
                    </button>
                  ))}
                </div>
              </div>
              {selectedContext && (
                <div className="p-3 border-b border-gray-100">
                  <p className="text-xs font-medium text-gray-500 mb-2">Adicionar bloco</p>
                  <div className="flex flex-col gap-1">
                    {BLOCK_TYPES.map(([type, label]) => (
                      <button key={type} onClick={() => addBlock(selectedContext.rowId, selectedContext.colId, type)}
                        className="text-left text-xs px-2 py-1.5 rounded-lg hover:bg-indigo-50 hover:text-indigo-700 text-gray-600 transition">
                        + {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!selectedContext && (
                <div className="p-3">
                  <p className="text-xs text-gray-400">Clique em uma coluna para adicionar blocos.</p>
                </div>
              )}
            </>
          ) : activeTab === "settings" ? (
            <div className="p-3 flex flex-col gap-4">
              {/* Trigger */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Gatilho</p>
                <select value={popup.trigger.type} onChange={e => update({ ...popup, trigger: { ...popup.trigger, type: e.target.value as "delay"|"scroll"|"exit" } })}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400 bg-white mb-2">
                  <option value="delay">Após X segundos</option>
                  <option value="scroll">Ao rolar X%</option>
                  <option value="exit">Exit intent</option>
                </select>
                {popup.trigger.type === "delay" && (
                  <div><label className="text-xs text-gray-500">Segundos</label>
                    <input type="number" min={0} value={popup.trigger.delaySeconds ?? 5} onChange={e => update({ ...popup, trigger: { ...popup.trigger, delaySeconds: +e.target.value } })}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400 mt-1" /></div>
                )}
                {popup.trigger.type === "scroll" && (
                  <div><label className="text-xs text-gray-500">% da página</label>
                    <input type="number" min={0} max={100} value={popup.trigger.scrollPercent ?? 50} onChange={e => update({ ...popup, trigger: { ...popup.trigger, scrollPercent: +e.target.value } })}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400 mt-1" /></div>
                )}
              </div>
              {/* Appearance */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Aparência</p>
                <div className="flex flex-col gap-2">
                  {[["Fundo do popup","backgroundColor"],["Overlay","overlayColor"]].map(([label, key]) => (
                    <div key={key}>
                      <label className="text-xs text-gray-500 block mb-1">{label}</label>
                      <input type="text" value={(popup as unknown as Record<string,string>)[key]} onChange={e => update({ ...popup, [key]: e.target.value } as Popup)}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400" />
                    </div>
                  ))}
                  {[["Largura máx.","maxWidth"],["Padding","padding"],["Border radius","borderRadius"]].map(([label, key]) => (
                    <div key={key}>
                      <label className="text-xs text-gray-500 block mb-1">{label}</label>
                      <input type="text" value={(popup as unknown as Record<string,string>)[key]} onChange={e => update({ ...popup, [key]: e.target.value } as Popup)}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400" />
                    </div>
                  ))}
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-500">Botão fechar</label>
                    <button onClick={() => update({ ...popup, showCloseButton: !popup.showCloseButton })}
                      className={`w-9 h-5 rounded-full transition ${popup.showCloseButton ? "bg-indigo-500" : "bg-gray-200"}`}>
                      <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${popup.showCloseButton ? "translate-x-4" : ""}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-500">1x por sessão</label>
                    <button onClick={() => update({ ...popup, showOncePerSession: !popup.showOncePerSession })}
                      className={`w-9 h-5 rounded-full transition ${popup.showOncePerSession ? "bg-indigo-500" : "bg-gray-200"}`}>
                      <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${popup.showOncePerSession ? "translate-x-4" : ""}`} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === "segmentation" ? (
            <SegmentationPanel
              seg={popup.segmentation ?? { operator: "and", conditions: [] }}
              onChange={seg => update({ ...popup, segmentation: seg })}
            />
          ) : null}
        </div>

        {/* Center — canvas */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center gap-4">
          {/* Popup preview */}
          <div style={{ background: popup.overlayColor }} className="w-full max-w-2xl rounded-xl p-4 flex items-center justify-center">
            <div style={{ background: popup.backgroundColor, maxWidth: popup.maxWidth, padding: popup.padding, borderRadius: popup.borderRadius }}
              className="w-full relative shadow-xl">
              {popup.showCloseButton && (
                <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
              )}
              <div className="flex flex-col gap-3">
                {popup.rows.map((row, ri) => (
                  <div key={row.id}>
                    <div className="flex items-center gap-1 mb-1">
                      <button onClick={() => moveRow(row.id, -1)} disabled={ri===0} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs px-1">↑</button>
                      <button onClick={() => moveRow(row.id, 1)} disabled={ri===popup.rows.length-1} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs px-1">↓</button>
                      <span className="text-xs text-gray-300 ml-1">{row.layout} col.</span>
                      <button onClick={() => removeRow(row.id)} className="ml-auto text-xs text-red-300 hover:text-red-500 px-1">×</button>
                    </div>
                    <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${row.layout}, 1fr)` }}>
                      {row.columns.map((col) => (
                        <div key={col.id}
                          onClick={() => { setSelectedColId(col.id); setSelectedBlockId(col.blocks[0]?.id ?? null); }}
                          onDragOver={e => { e.preventDefault(); onDragOverBlock(row.id, col.id, col.blocks.length); }}
                          onDrop={onDrop}
                          style={{ justifyContent: col.justifyContent || "flex-start", alignItems: col.alignItems || "stretch" }}
                          className={`min-h-[48px] rounded-lg border-2 border-dashed p-2 flex flex-col gap-2 transition ${selectedContext?.colId === col.id ? "border-indigo-300 bg-indigo-50/30" : "border-gray-200 hover:border-indigo-200"}`}>
                          {col.blocks.map((block, bi) => (
                            <div key={block.id} draggable
                              onDragStart={() => onDragStart(row.id, col.id, block.id)}
                              onDragOver={e => { e.preventDefault(); e.stopPropagation(); onDragOverBlock(row.id, col.id, bi); }}
                              onClick={e => { e.stopPropagation(); setSelectedColId(col.id); setSelectedBlockId(block.id === selectedBlockId ? null : block.id); }}
                              style={{ marginTop: block.marginTop || "0", marginBottom: block.marginBottom || "0", marginLeft: block.marginLeft || "0", marginRight: block.marginRight || "0" }}>
                              <BlockPreview block={block} selected={selectedBlockId === block.id} onClick={() => {}} />
                            </div>
                          ))}
                          {col.blocks.length === 0 && (
                            <div className="text-xs text-gray-300 text-center py-2">
                              {selectedContext?.colId === col.id ? "Adicione blocos →" : "Clique para selecionar"}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {popup.rows.length === 0 && (
                  <div className="text-center text-gray-400 text-sm py-8">Adicione uma linha para começar</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right sidebar — block config + column alignment */}
        <div className="w-60 bg-white border-l border-gray-200 flex flex-col flex-shrink-0 overflow-y-auto">
          <div className="p-3 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-500">{selectedContext ? "Propriedades do bloco" : selectedColumn ? "Propriedades da coluna" : "Selecione um elemento"}</p>
          </div>
          <div className="p-3 flex flex-col gap-4">
            {selectedColumn && (
              <div className="flex flex-col gap-3">
                <p className="text-xs font-medium text-gray-700">Alinhamento da coluna</p>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Vertical</label>
                  <div className="flex gap-1">
                    {([["flex-start","Topo"],["center","Centro"],["flex-end","Base"]] as const).map(([v,l]) => (
                      <button key={v} onClick={() => updateColumn(selectedColumn.rowId, { ...selectedColumn.col, justifyContent: v })}
                        className={`flex-1 py-1 text-xs rounded border transition ${selectedColumn.col.justifyContent === v || (!selectedColumn.col.justifyContent && v === "flex-start") ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Horizontal</label>
                  <div className="flex gap-1">
                    {([["flex-start","Esq."],["center","Centro"],["flex-end","Dir."]] as const).map(([v,l]) => (
                      <button key={v} onClick={() => updateColumn(selectedColumn.rowId, { ...selectedColumn.col, alignItems: v })}
                        className={`flex-1 py-1 text-xs rounded border transition ${selectedColumn.col.alignItems === v || (!selectedColumn.col.alignItems && v === "flex-start") ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                {selectedContext && <div className="border-t border-gray-100 pt-3" />}
              </div>
            )}
            {selectedContext ? (
              <>
                <BlockConfig
                  block={selectedContext.block}
                  onChange={b => updateBlock(selectedContext.rowId, selectedContext.colId, b)}
                  onDelete={() => removeBlock(selectedContext.rowId, selectedContext.colId, selectedContext.block.id)}
                  userId={user?.uid ?? ""}
                />
                <div className="border-t border-gray-100 pt-3 flex flex-col gap-2">
                  <p className="text-xs font-medium text-gray-700">Margens</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([["marginTop","Cima"],["marginBottom","Baixo"],["marginLeft","Esq."],["marginRight","Dir."]] as const).map(([key, label]) => (
                      <div key={key}>
                        <label className="text-xs text-gray-500 block mb-1">{label}</label>
                        <input
                          type="text"
                          placeholder="0px"
                          value={selectedContext.block[key] || ""}
                          onChange={e => updateBlock(selectedContext.rowId, selectedContext.colId, { ...selectedContext.block, [key]: e.target.value })}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-400"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : !selectedColumn ? (
              <p className="text-xs text-gray-400">Clique em um bloco ou coluna no canvas para editar.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
