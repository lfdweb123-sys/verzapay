"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutes au total avant déconnexion
const WARNING_BEFORE_MS = 2 * 60 * 1000; // popup affichée 2 min avant la limite
const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"] as const;

interface UseInactivityLogoutResult {
  showWarning: boolean;
  secondsLeft: number;
  stayActive: () => void;
}

/**
 * Surveille l'activité utilisateur (souris, clavier, scroll, touch). Après
 * INACTIVITY_LIMIT_MS - WARNING_BEFORE_MS sans interaction, affiche un
 * avertissement avec compte à rebours. Si l'utilisateur n'interagit pas
 * avant la fin du compte à rebours, `onTimeout` est appelé (déconnexion).
 * Pendant l'avertissement, seul un clic explicite sur "Continuer" (stayActive)
 * réinitialise le minuteur — l'activité passive ne suffit pas, pour que
 * l'avertissement reste visible et l'action volontaire.
 */
export function useInactivityLogout(onTimeout: () => void, enabled: boolean): UseInactivityLogoutResult {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.floor(WARNING_BEFORE_MS / 1000));

  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warningActiveRef = useRef(false);

  const clearAllTimers = useCallback(() => {
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
  }, []);

  const startCountdown = useCallback(() => {
    setShowWarning(true);
    warningActiveRef.current = true;
    setSecondsLeft(Math.floor(WARNING_BEFORE_MS / 1000));

    countdownIntervalRef.current = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);

    logoutTimerRef.current = setTimeout(() => {
      clearAllTimers();
      setShowWarning(false);
      warningActiveRef.current = false;
      onTimeout();
    }, WARNING_BEFORE_MS);
  }, [clearAllTimers, onTimeout]);

  const scheduleWarning = useCallback(() => {
    clearAllTimers();
    setShowWarning(false);
    warningActiveRef.current = false;
    warnTimerRef.current = setTimeout(startCountdown, INACTIVITY_LIMIT_MS - WARNING_BEFORE_MS);
  }, [clearAllTimers, startCountdown]);

  const stayActive = useCallback(() => {
    scheduleWarning();
  }, [scheduleWarning]);

  useEffect(() => {
    if (!enabled) return;

    function handleActivity() {
      if (warningActiveRef.current) return;
      scheduleWarning();
    }

    scheduleWarning();
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));

    return () => {
      clearAllTimers();
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handleActivity));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { showWarning, secondsLeft, stayActive };
}
