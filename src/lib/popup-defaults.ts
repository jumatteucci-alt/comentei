import { Popup, PopupRow, PopupColumn, Block, BlockType } from "@/types";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function defaultBlock(type: BlockType): Block {
  switch (type) {
    case "image":
      return { id: uid(), type: "image", src: "", alt: "", width: "100%", borderRadius: "8px" };
    case "title":
      return { id: uid(), type: "title", text: "Título do popup", fontSize: "24px", color: "#111111", align: "center", fontWeight: "700" };
    case "text":
      return { id: uid(), type: "text", text: "Adicione uma descrição aqui.", fontSize: "14px", color: "#444444", align: "center" };
    case "button":
      return { id: uid(), type: "button", label: "Clique aqui", url: "#", openInNewTab: false, backgroundColor: "#4f46e5", color: "#ffffff", fontSize: "14px", borderRadius: "8px", align: "center", fullWidth: false };
    case "countdown":
      const d = new Date(); d.setDate(d.getDate() + 3);
      return { id: uid(), type: "countdown", targetDate: d.toISOString(), expiredText: "Oferta encerrada!", color: "#111111", fontSize: "32px", align: "center" };
    case "email-input":
      return { id: uid(), type: "email-input", placeholder: "Digite seu e-mail", buttonLabel: "Quero participar", buttonColor: "#4f46e5", buttonTextColor: "#ffffff", successMessage: "Obrigado! Em breve entraremos em contato.", webhookUrl: "" };
  }
}

export function defaultColumn(): PopupColumn {
  return { id: uid(), blocks: [] };
}

export function defaultRow(layout: 1 | 2 | 3 = 1): PopupRow {
  const cols = Array.from({ length: layout }, () => defaultColumn());
  return { id: uid(), layout, columns: cols };
}

export function defaultPopup(siteId: string): Omit<Popup, "id"> {
  return {
    siteId,
    name: "Novo popup",
    active: false,
    rows: [
      { ...defaultRow(1), columns: [{ id: uid(), blocks: [defaultBlock("title"), defaultBlock("text"), defaultBlock("button")] }] }
    ],
    trigger: { type: "delay", delaySeconds: 5 },
    overlayColor: "rgba(0,0,0,0.5)",
    backgroundColor: "#ffffff",
    maxWidth: "560px",
    padding: "2rem",
    borderRadius: "12px",
    showCloseButton: true,
    showOncePerSession: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
