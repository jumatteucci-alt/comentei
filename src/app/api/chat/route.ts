import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getAdminDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return getFirestore();
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    const { widgetId, messages } = await req.json();

    if (!widgetId || !messages?.length)
      return NextResponse.json({ ok: false, error: "Parâmetros inválidos" }, { status: 400, headers: CORS });

    const db = getAdminDb();

    // Load chat config
    const configSnap = await db.collection("chat_config").doc(widgetId).get();
    if (!configSnap.exists)
      return NextResponse.json({ ok: false, error: "Chat não configurado" }, { status: 404, headers: CORS });

    const config = configSnap.data()!;
    if (!config.geminiKey)
      return NextResponse.json({ ok: false, error: "Chave da API não configurada" }, { status: 400, headers: CORS });

    // Load products
    const productsSnap = await db.collection("chat_products")
      .where("widgetId", "==", widgetId)
      .orderBy("createdAt", "asc")
      .get();

    const products = productsSnap.docs.map(d => d.data());

    // Build system prompt with product context
    const productContext = products.length > 0
      ? `\n\nPRODUTOS DISPONÍVEIS:\n${products.map((p, i) =>
          `${i + 1}. ${p.name}\n   Descrição: ${p.description}\n   Preço: ${p.price}\n   Link: ${p.link}`
        ).join("\n\n")}`
      : "\n\nNenhum produto cadastrado ainda.";

    const systemInstruction = (config.systemPrompt || "Você é um assistente de vendas prestativo e simpático. Responda de forma clara e objetiva. Sempre que possível, direcione o usuário para os produtos relevantes.") + 
      "\n\nFORMATAÇÃO: Use **negrito** para destacar informações importantes. Quando mencionar links, use SEMPRE o formato markdown [texto do link](url) — por exemplo: [Comprar agora](https://site.com). Nunca cole a URL solta no texto." +
      productContext;

    // Call Gemini API
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${config.geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: messages.map((m: { role: string; text: string }) => ({
            role: m.role === "user" ? "user" : "model",
            parts: [{ text: m.text }],
          })),
          generationConfig: { maxOutputTokens: 512, temperature: 0.7 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.json();
      return NextResponse.json({ ok: false, error: err?.error?.message || "Erro na API do Gemini" }, { status: 502, headers: CORS });
    }

    const geminiData = await geminiRes.json();
    const reply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Desculpe, não consegui gerar uma resposta.";

    return NextResponse.json({ ok: true, reply }, { headers: CORS });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500, headers: CORS });
  }
}
