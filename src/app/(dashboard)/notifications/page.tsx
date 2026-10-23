"use client";

import { useEffect, useRef, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { cn, formatRelative } from "@/lib/utils";
import { Bell, Trash2, CheckSquare, Square, X } from "lucide-react";
import Link from "next/link";
import type { NotificationItem } from "@/types";
import { Pagination, usePagination } from "@/components/ui/pagination";

const TYPE_COLORS: Record<NotificationItem["type"], string> = {
  payment: "bg-success-500",
  payout: "bg-brand-500",
  kyc: "bg-warning-500",
  system: "bg-ink-400",
  team: "bg-brand-500",
  admin: "bg-danger-500",
};

const SWIPE_DELETE_THRESHOLD = -88; // px avant déclenchement de la suppression au relâchement
const SWIPE_MAX = -96; // butée visuelle du glissement

export default function NotificationsPage() {
  const { user } = useAuth();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const pg = usePagination(notifications, 20);
  const [loading, setLoading] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openedNotif, setOpenedNotif] = useState<NotificationItem | null>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "notifications"),
      where("uid", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(200)
    );
    const unsub = onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map((d) => d.data() as NotificationItem));
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const allSelected = notifications.length > 0 && selected.size === notifications.length;

  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelected(new Set());
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(notifications.map((n) => n.id)));
  }

  async function openNotification(n: NotificationItem) {
    if (selectMode) {
      toggleOne(n.id);
      return;
    }
    if (!n.read) {
      await updateDoc(doc(db, "notifications", n.id), { read: true }).catch(() => {});
    }
    setOpenedNotif(n);
  }

  async function deleteOne(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await deleteDoc(doc(db, "notifications", id)).catch(() => {});
  }

  async function deleteSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setNotifications((prev) => prev.filter((n) => !selected.has(n.id)));
    setSelected(new Set());
    setSelectMode(false);

    const batch = writeBatch(db);
    ids.forEach((id) => batch.delete(doc(db, "notifications", id)));
    await batch.commit().catch(() => {});
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-medium text-ink-900 flex items-center gap-2">
            <Bell size={20} className="text-ink-500" />
            Notifications
          </h1>
          <p className="text-sm text-ink-500 mt-0.5">
            {notifications.length} notification{notifications.length !== 1 ? "s" : ""}
          </p>
        </div>

        {notifications.length > 0 && (
          <div className="hidden sm:flex items-center gap-2">
            {selectMode && (
              <button
                onClick={toggleAll}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-ink-200 text-sm font-medium text-ink-700 hover:bg-ink-50 transition-colors"
              >
                {allSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                Tout sélectionner
              </button>
            )}
            {selectMode && selected.size > 0 && (
              <button
                onClick={deleteSelected}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-danger-600 text-white text-sm font-medium hover:bg-danger-700 transition-colors"
              >
                <Trash2 size={15} />
                Supprimer ({selected.size})
              </button>
            )}
            <button
              onClick={toggleSelectMode}
              className={cn(
                "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium transition-colors",
                selectMode
                  ? "border-ink-200 text-ink-700 hover:bg-ink-50"
                  : "border-ink-200 text-ink-700 hover:bg-ink-50"
              )}
            >
              {selectMode ? (
                <>
                  <X size={15} /> Annuler
                </>
              ) : (
                <>
                  <Trash2 size={15} /> Supprimer en masse
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Barre d'actions mobile en mode sélection */}
      {selectMode && (
        <div className="sm:hidden flex items-center justify-between mb-3 bg-white border border-ink-200 rounded-xl px-3 py-2.5">
          <button onClick={toggleAll} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-700">
            {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
            Tout
          </button>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <button
                onClick={deleteSelected}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-danger-600 text-white text-sm font-medium"
              >
                <Trash2 size={14} /> ({selected.size})
              </button>
            )}
            <button onClick={toggleSelectMode} className="h-8 px-3 rounded-lg text-sm font-medium text-ink-600">
              Annuler
            </button>
          </div>
        </div>
      )}

      {!selectMode && notifications.length > 0 && (
        <button
          onClick={toggleSelectMode}
          className="sm:hidden mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500"
        >
          <Trash2 size={14} /> Sélectionner
        </button>
      )}

      <div className="bg-white border border-ink-200 rounded-xl overflow-hidden">
        {loading ? (
          <p className="text-sm text-ink-500 text-center py-12">Chargement…</p>
        ) : notifications.length === 0 ? (
          <div className="text-center py-16 px-4">
            <Bell size={28} className="mx-auto text-ink-300 mb-3" />
            <p className="text-sm text-ink-500">Aucune notification pour le moment</p>
          </div>
        ) : (
          pg.pageItems.map((n) => (
            <NotificationRow
              key={n.id}
              notification={n}
              selectMode={selectMode}
              checked={selected.has(n.id)}
              onOpen={() => openNotification(n)}
              onDelete={() => deleteOne(n.id)}
            />
          ))
        )}
      </div>

      <p className="hidden sm:block text-xs text-ink-400 mt-3">
        Astuce : sur mobile, glissez une notification vers la gauche pour la supprimer.
      </p>

      {openedNotif && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setOpenedNotif(null)}
        >
          <div
            className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-2xl shadow-popover overflow-hidden animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-ink-100">
              <div className="flex items-start gap-2.5 min-w-0">
                <span className={cn("mt-1.5 w-2 h-2 rounded-full shrink-0", TYPE_COLORS[openedNotif.type])} />
                <div className="min-w-0">
                  <p className="text-base font-medium text-ink-900">{openedNotif.title}</p>
                  <p className="text-xs text-ink-400 mt-0.5">{formatRelative(openedNotif.createdAt)}</p>
                </div>
              </div>
              <button
                onClick={() => setOpenedNotif(null)}
                className="shrink-0 text-ink-400 hover:text-ink-700"
                aria-label="Fermer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
              <p className="text-sm text-ink-700 whitespace-pre-wrap leading-relaxed">{openedNotif.body}</p>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-ink-100">
              <button
                onClick={() => {
                  deleteOne(openedNotif.id);
                  setOpenedNotif(null);
                }}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium text-danger-700 hover:bg-danger-50 transition-colors"
              >
                <Trash2 size={15} /> Supprimer
              </button>
              {openedNotif.link && (
                <Link
                  href={openedNotif.link}
                  onClick={() => setOpenedNotif(null)}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-800 transition-colors"
                >
                  Voir
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} onChange={pg.setPage} />
    </div>
  );
}

function NotificationRow({
  notification: n,
  selectMode,
  checked,
  onOpen,
  onDelete,
}: {
  notification: NotificationItem;
  selectMode: boolean;
  checked: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const axisLocked = useRef<"x" | "y" | null>(null);

  function handlePointerDown(e: React.PointerEvent) {
    if (selectMode) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    axisLocked.current = null;
    setDragging(true);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging || startX.current === null || startY.current === null) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;

    if (!axisLocked.current) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      axisLocked.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (axisLocked.current !== "x") return;

    e.preventDefault();
    setDragX(Math.max(SWIPE_MAX, Math.min(0, dx)));
  }

  function handlePointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (dragX <= SWIPE_DELETE_THRESHOLD) {
      setDragX(-400);
      setRemoving(true);
      setTimeout(onDelete, 180);
    } else {
      setDragX(0);
    }
    startX.current = null;
    startY.current = null;
    axisLocked.current = null;
  }

  return (
    <div className="relative border-b border-ink-50 last:border-0 overflow-hidden touch-pan-y">
      {/* Fond rouge "Supprimer" révélé par le glissement */}
      <div className="absolute inset-0 bg-danger-600 flex items-center justify-end pr-5 sm:hidden">
        <Trash2 size={17} className="text-white" />
      </div>

      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragging ? "none" : "transform 180ms ease-out, opacity 180ms ease-out",
          opacity: removing ? 0 : 1,
        }}
        className={cn("relative bg-white px-4 py-3 flex items-start gap-3", !n.read && "bg-brand-50/50")}
      >
        {selectMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="mt-0.5 shrink-0 text-ink-400"
          >
            {checked ? <CheckSquare size={18} className="text-brand-600" /> : <Square size={18} />}
          </button>
        )}

        <button onClick={onOpen} className="flex-1 min-w-0 flex items-start gap-2.5 text-left">
          <span className={cn("mt-1.5 w-2 h-2 rounded-full shrink-0", TYPE_COLORS[n.type])} />
          <div className="flex-1 min-w-0">
            <p className={cn("text-sm text-ink-900", !n.read && "font-medium")}>{n.title}</p>
            <p className="text-xs text-ink-500 mt-0.5">{n.body}</p>
            <p className="text-[11px] text-ink-400 mt-1">{formatRelative(n.createdAt)}</p>
          </div>
        </button>

        {/* Bouton supprimer unique, visible au clic droit / hover sur desktop */}
        {!selectMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDragX(-400);
              setRemoving(true);
              setTimeout(onDelete, 180);
            }}
            className="hidden sm:flex shrink-0 w-7 h-7 rounded-md items-center justify-center text-ink-300 hover:text-danger-600 hover:bg-danger-50 transition-colors"
            aria-label="Supprimer la notification"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
