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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const widgetId = searchParams.get("widgetId");
    const pageId = searchParams.get("pageId");
    if (!widgetId) return NextResponse.json({ ok: false, error: "widgetId obrigatório" }, { status: 400, headers: CORS });

    const db = getAdminDb();
    let q = db.collection("comments").where("siteId", "==", widgetId).orderBy("createdAt", "asc");
    if (pageId) q = q.where("pageId", "==", pageId) as typeof q;

    const snap = await q.get();
    const all = snap.docs.map(d => {
      const data = d.data();
      return { id: d.id, siteId: data.siteId, pageId: data.pageId, parentId: data.parentId || null, name: data.name, text: data.text, createdAt: data.createdAt };
    });

    const roots = all.filter(c => !c.parentId).map(c => ({
      ...c,
      replies: all.filter(r => r.parentId === c.id),
    }));

    return NextResponse.json({ ok: true, data: roots }, { headers: CORS });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500, headers: CORS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { widgetId, pageId, parentId, name, email, text } = body;

    if (!widgetId || !name?.trim() || !email?.trim() || !text?.trim())
      return NextResponse.json({ ok: false, error: "Campos obrigatórios ausentes." }, { status: 400, headers: CORS });

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return NextResponse.json({ ok: false, error: "E-mail inválido." }, { status: 400, headers: CORS });

    const db = getAdminDb();

    // Verificar se o widgetId existe
    const sites = await db.collection("sites").where("widgetId", "==", widgetId).limit(1).get();
    if (sites.empty) return NextResponse.json({ ok: false, error: "Widget não encontrado." }, { status: 404, headers: CORS });

    const ref = await db.collection("comments").add({
      siteId: widgetId,
      pageId: pageId || "/",
      parentId: parentId || null,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      text: text.trim(),
      createdAt: Date.now(),
    });

    return NextResponse.json({ ok: true, data: { id: ref.id } }, { headers: CORS });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500, headers: CORS });
  }
}
