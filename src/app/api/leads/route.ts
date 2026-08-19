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
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { widgetId, popupId, email } = body;
    if (!widgetId || !email) return NextResponse.json({ ok: false, error: "widgetId e email obrigatórios" }, { status: 400, headers: CORS });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ ok: false, error: "E-mail inválido" }, { status: 400, headers: CORS });

    const db = getAdminDb();
    await db.collection("leads").add({
      widgetId,
      popupId: popupId || null,
      email: email.trim().toLowerCase(),
      createdAt: Date.now(),
      source: "popup",
    });

    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500, headers: CORS });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const widgetId = searchParams.get("widgetId");
    if (!widgetId) return NextResponse.json({ ok: false, error: "widgetId obrigatório" }, { status: 400, headers: CORS });

    const db = getAdminDb();
    const snap = await db.collection("leads")
      .where("widgetId", "==", widgetId)
      .orderBy("createdAt", "desc")
      .get();

    const leads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ ok: true, data: leads }, { headers: CORS });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500, headers: CORS });
  }
}
