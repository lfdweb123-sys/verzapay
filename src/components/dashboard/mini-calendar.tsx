"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import { cn, formatXOF } from "@/lib/utils";
import type { Transaction } from "@/types";

interface MiniCalendarProps {
  transactions: Transaction[];
  selectedDate: Date | null;
  onSelectDate: (date: Date | null) => void;
}

export function MiniCalendar({ transactions, selectedDate, onSelectDate }: MiniCalendarProps) {
  const [month, setMonth] = useState(new Date());

  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
  const firstDayOfWeek = (startOfMonth(month).getDay() + 6) % 7; // Lundi = 0

  function volumeForDay(day: Date) {
    return transactions
      .filter((t) => t.status === "completed" && isSameDay(new Date(t.createdAt), day))
      .reduce((s, t) => s + t.amount, 0);
  }

  function handleDayClick(day: Date) {
    if (selectedDate && isSameDay(day, selectedDate)) {
      onSelectDate(null); // re-clic = désélectionne
    } else {
      onSelectDate(day);
    }
  }

  const displayVolume = selectedDate ? volumeForDay(selectedDate) : volumeForDay(new Date());

  return (
    <div className="card-base p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-900">
          {format(month, "MMMM yyyy", { locale: fr })}
        </p>
        <div className="flex items-center gap-1">
          <button onClick={() => setMonth(subMonths(month, 1))} className="btn-ghost w-7 h-7 p-0" aria-label="Mois précédent">
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => setMonth(addMonths(month, 1))} className="btn-ghost w-7 h-7 p-0" aria-label="Mois suivant">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Jours de la semaine */}
      <div className="grid grid-cols-7 gap-0.5">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-ink-400 py-1">{d}</div>
        ))}

        {/* Cellules vides avant le 1er */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {/* Jours du mois — cliquables */}
        {days.map((day) => {
          const vol = volumeForDay(day);
          const hasActivity = vol > 0;
          const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
          return (
            <button
              type="button"
              key={day.toISOString()}
              onClick={() => handleDayClick(day)}
              title={hasActivity ? formatXOF(vol) : "Aucune transaction"}
              className={cn(
                "aspect-square flex items-center justify-center text-xs rounded-md transition-colors cursor-pointer",
                isSelected && "bg-brand-700 text-white font-medium ring-2 ring-brand-300",
                !isSelected && isToday(day) && "bg-brand-700 text-white font-medium",
                !isSelected && !isToday(day) && hasActivity && "bg-brand-50 text-brand-800 hover:bg-brand-100",
                !isSelected && !isToday(day) && !hasActivity && "text-ink-600 hover:bg-ink-100"
              )}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>

      <div className="border-t border-ink-100 pt-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] text-ink-500">
            {selectedDate ? `Volume du ${format(selectedDate, "d MMM", { locale: fr })}` : "Volume aujourd'hui"}
          </p>
          <p className="text-base font-medium text-ink-900 mt-0.5 tabular-nums">{formatXOF(displayVolume)}</p>
        </div>
        {selectedDate && (
          <button
            onClick={() => onSelectDate(null)}
            className="flex items-center gap-1 text-xs text-ink-500 hover:text-ink-900 transition-colors"
          >
            <X size={12} /> Effacer
          </button>
        )}
      </div>
    </div>
  );
}
