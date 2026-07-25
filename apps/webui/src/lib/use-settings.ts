import { useCallback, useEffect, useState } from "react";

import { getSettings, updateSettings } from "./api";
import type { SettingsResponse, SettingsUpdate } from "./types";

export function useSettings() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSettings(await getSettings());
      setError("");
    } catch (cause) {
      setSettings(null);
      setError(cause instanceof Error ? cause.message : "配置读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void getSettings()
      .then((next) => {
        if (active) {
          setSettings(next);
          setError("");
        }
      })
      .catch((cause) => {
        if (active) {
          setSettings(null);
          setError(cause instanceof Error ? cause.message : "配置读取失败");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const save = useCallback(async (values: SettingsUpdate) => {
    setSaving(true);
    try {
      const next = await updateSettings(values);
      setSettings(next);
      setError("");
      return next;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "配置保存失败";
      setSettings(null);
      setError(message);
      throw cause;
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    error,
    loading,
    refresh,
    save,
    saving,
    settings,
  };
}
