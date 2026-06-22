"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, Plus, Send, X, Menu } from "lucide-react";
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";
import { cn, formatRelative } from "@/lib/utils";
import type { NotificationItem } from "@/types";
import Link from "next/link";

export function DashboardHeader({ sidebarCollapsed, onMenuClick }: { sidebarCollapsed: boolean; onMenuClick?: () => void }) {
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "notifications"),
      where("uid", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    return onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map((d) => d.data() as NotificationItem));
    });
  }, [user]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function markAllRead() {
    if (!user) return;
    for (const n of notifications.filter((x) => !x.read)) {
      await updateDoc(doc(db, "notifications", n.id), { read: true });
    }
  }

  return (
    <header
      className={cn(
        "fixed top-0 right-0 left-0 z-40 h-16 bg-white border-b border-ink-200 flex items-center px-3 sm:px-4 gap-2 sm:gap-3 transition-all duration-300",
        sidebarCollapsed ? "lg:left-[76px]" : "lg:left-[260px]"
      )}
    >
      {/* Hamburger mobile */}
      <button
        onClick={onMenuClick}
        className="lg:hidden w-9 h-9 -ml-1 rounded-lg flex items-center justify-center hover:bg-ink-100 transition-colors text-ink-700 shrink-0"
        aria-label="Ouvrir le menu"
      >
        <Menu size={20} />
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        {/* Créer un lien de paiement */}
        <Link
          href="/payments/new"
          className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-ink-200 text-sm font-medium text-ink-700 hover:bg-ink-50 transition-colors"
        >
          <Plus size={15} /> Créer un lien
        </Link>

        {/* Envoyer un paiement */}
        {activeCompany?.kycStatus === "approved" && (activeCompany?.walletBalance ?? 0) > 0 && (
          <Link
            href="/payouts/new"
            className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 transition-colors"
          >
            <Send size={14} /> Envoyer
          </Link>
        )}

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => { setNotifOpen((v) => !v); if (!notifOpen && unreadCount > 0) markAllRead(); }}
            className="relative w-9 h-9 rounded-lg flex items-center justify-center hover:bg-ink-100 transition-colors"
          >
            <Bell size={18} className="text-ink-600" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger-500" />
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-ink-200 rounded-xl shadow-popover z-50 overflow-hidden animate-slide-up">
              <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100">
                <p className="text-sm font-medium">Notifications</p>
                <button onClick={() => setNotifOpen(false)} className="text-ink-400 hover:text-ink-700">
                  <X size={16} />
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto scrollbar-none">
                {notifications.length === 0 ? (
                  <p className="text-sm text-ink-500 text-center py-8">Aucune notification</p>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className={cn("px-4 py-3 border-b border-ink-50 last:border-0", !n.read && "bg-brand-50/50")}>
                      <div className="flex items-start gap-2">
                        <NotifDot type={n.type} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink-900">{n.title}</p>
                          <p className="text-xs text-ink-500 mt-0.5">{n.body}</p>
                          <p className="text-[11px] text-ink-400 mt-1">{formatRelative(n.createdAt)}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function NotifDot({ type }: { type: NotificationItem["type"] }) {
  const colors: Record<NotificationItem["type"], string> = {
    payment: "bg-success-500",
    payout: "bg-brand-500",
    kyc: "bg-warning-500",
    system: "bg-ink-400",
    team: "bg-brand-500",
    admin: "bg-danger-500",
  };
  return <span className={cn("mt-1.5 w-2 h-2 rounded-full shrink-0", colors[type])} />;
}
