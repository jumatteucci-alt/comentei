"use client";
export const dynamic = "force-dynamic";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useState } from "react";
import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [siteName, setSiteName] = useState<string | undefined>();

  // Editor de popup usa layout próprio (tela cheia)
  const isFullscreen = pathname.includes("/dashboard/popups/") && pathname.split("/").length > 3;

  useEffect(() => {
    if (!loading && !user) router.push("/auth");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "sites", user.uid)).then(snap => {
      if (snap.exists()) setSiteName((snap.data() as { name: string }).name);
    });
  }, [user]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!user) return null;

  if (isFullscreen) return <>{children}</>;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar siteName={siteName} />
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
