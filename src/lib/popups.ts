import { db } from "@/lib/firebase";
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, getDoc, query, where, orderBy
} from "firebase/firestore";
import { Popup } from "@/types";

export async function getPopups(widgetId: string): Promise<Popup[]> {
  const q = query(
    collection(db, "popups"),
    where("siteId", "==", widgetId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Popup));
}

export async function getPopup(id: string): Promise<Popup | null> {
  const snap = await getDoc(doc(db, "popups", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Popup;
}

export async function createPopup(data: Omit<Popup, "id">): Promise<string> {
  const ref = await addDoc(collection(db, "popups"), data);
  return ref.id;
}

export async function updatePopup(id: string, data: Partial<Popup>): Promise<void> {
  await updateDoc(doc(db, "popups", id), { ...data, updatedAt: Date.now() });
}

export async function deletePopup(id: string): Promise<void> {
  await deleteDoc(doc(db, "popups", id));
}
