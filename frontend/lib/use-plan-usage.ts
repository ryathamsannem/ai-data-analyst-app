"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PLAN_TIER_CHANGED_EVENT,
  USAGE_REFRESH_EVENT,
} from "@/lib/saas-session";
import {
  fetchPlanUsage,
  type PlanUsageResponse,
} from "@/lib/usage-api";

type UsePlanUsageOptions = {
  enabled?: boolean;
};

export function usePlanUsage(options: UsePlanUsageOptions = {}) {
  const { enabled = true } = options;
  const [data, setData] = useState<PlanUsageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchPlanUsage();
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load usage");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const onRefresh = () => {
      refresh();
    };
    window.addEventListener(PLAN_TIER_CHANGED_EVENT, onRefresh);
    window.addEventListener(USAGE_REFRESH_EVENT, onRefresh);
    return () => {
      window.removeEventListener(PLAN_TIER_CHANGED_EVENT, onRefresh);
      window.removeEventListener(USAGE_REFRESH_EVENT, onRefresh);
    };
  }, [enabled, refresh]);

  return { data, loading, error, refresh };
}
