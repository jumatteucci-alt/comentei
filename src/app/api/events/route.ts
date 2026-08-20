import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

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

// POST /api/events  { widgetId, popupId, event: "view"|"click" }
export async function POST(req: NextRequest) {
  try {
    const { widgetId, popupId, event } = await req.json();
    if (!widgetId || !popupId || !["view", "click"].includes(event))
      return NextResponse.json({ ok: false, error: "Parâmetros inválidos" }, { status: 400, headers: CORS });

    const db = getAdminDb();
    const statsRef = db.collection("popup_stats").doc(popupId);

    // Increment the right counter atomically
    await statsRef.set(
      {
        widgetId,
        popupId,
        [event === "view" ? "views" : "clicks"]: FieldValue.increment(1),
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500, headers: CORS });
  }
}
