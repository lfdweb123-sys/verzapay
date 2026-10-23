"use client";

import { useEffect } from "react";
import { auth } from "@/lib/firebase";

/**
 * Ajoute automatiquement le jeton Firebase de l'utilisateur connecté
 * (Authorization: Bearer <idToken>) à tous les appels de CE site vers /api/.
 * Le serveur vérifie ce jeton : un simple uid ne suffit plus pour agir au nom
 * d'un compte. Les appels qui ont déjà un en-tête Authorization (ex. clé API
 * saisie dans le testeur d'API) ne sont pas modifiés.
 */
export function AuthFetch() {
  useEffect(() => {
    const w = window as typeof window & { __vpzFetchPatched?: boolean };
    if (w.__vpzFetchPatched) return;
    w.__vpzFetchPatched = true;

    const original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const path = url.startsWith("/") ? url : url.startsWith(window.location.origin) ? url.slice(window.location.origin.length) : "";
        if (path.startsWith("/api/") && auth.currentUser) {
          const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
          if (!headers.has("Authorization")) {
            headers.set("Authorization", `Bearer ${await auth.currentUser.getIdToken()}`);
          }
          return original(input, { ...init, headers });
        }
      } catch {
        /* en cas d'échec de jeton, la requête part telle quelle (le serveur la refusera) */
      }
      return original(input, init);
    };
  }, []);
  return null;
}
