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
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const widgetId = searchParams.get("widgetId");
    if (!widgetId) return NextResponse.json({ ok: false }, { status: 400, headers: CORS });

    const db = getAdminDb();
    const snap = await db.collection("chat_config").doc(widgetId).get();
    if (!snap.exists) return NextResponse.json({ ok: false }, { status: 404, headers: CORS });

    const data = snap.data()!;
    // Only expose safe public fields — never the geminiKey
    return NextResponse.json({
      ok: true,
      config: {
        assistantName: data.assistantName || "Assistente",
        welcomeMessage: data.welcomeMessage || "Olá! Como posso te ajudar?",
        primaryColor: data.primaryColor || "#4f46e5",
        mode: data.mode || "floating",
      }
    }, { headers: CORS });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500, headers: CORS });
  }
}
