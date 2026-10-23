"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZE = 20;

/**
 * Pagination côté client d'une liste déjà chargée. La pagination n'apparaît
 * qu'à partir de 20 éléments. `resetKey` ramène à la page 1 (ex. recherche/filtre).
 */
export function usePagination<T>(items: T[], pageSize: number = PAGE_SIZE, resetKey?: unknown) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => { setPage(1); }, [resetKey]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize]
  );

  return { page, setPage, pageCount, pageItems, total: items.length, pageSize };
}

interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
  pageSize?: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pageCount, total, pageSize = PAGE_SIZE, onChange }: PaginationProps) {
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-3 px-1 py-3 text-sm text-ink-500">
      <span className="tabular-nums">{from}–{to} sur {total}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="btn-secondary h-8 px-2.5 text-sm disabled:opacity-40"
          aria-label="Page précédente"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="tabular-nums">Page {page} / {pageCount}</span>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= pageCount}
          className="btn-secondary h-8 px-2.5 text-sm disabled:opacity-40"
          aria-label="Page suivante"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
