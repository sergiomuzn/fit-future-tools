import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const KEY = "app_last_activity";
const TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours

function now() {
  return Date.now();
}

function readLast(): number {
  const raw = localStorage.getItem(KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function writeLast() {
  localStorage.setItem(KEY, String(now()));
}

export function useInactivityLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    async function expire() {
      if (cancelled) return;
      localStorage.removeItem(KEY);
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true });
    }

    const last = readLast();
    if (last && now() - last > TIMEOUT_MS) {
      void expire();
      return;
    }
    writeLast();

    const bump = () => writeLast();
    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "click",
    ];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const l = readLast();
      if (l && now() - l > TIMEOUT_MS) void expire();
      else writeLast();
    };
    document.addEventListener("visibilitychange", onVisible);

    const interval = window.setInterval(() => {
      const l = readLast();
      if (l && now() - l > TIMEOUT_MS) void expire();
    }, 60 * 1000);

    return () => {
      cancelled = true;
      events.forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [navigate, queryClient]);
}