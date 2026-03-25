import { useEffect, useMemo, useState } from "react";
import { db, onValue, ref } from "@/lib/firebase";

export type UiConfig = {
  appName: string;
  appLogo: string;
  adminTitle: string;
  adminSubtitle: string;
  loginTitle: string;
  loginSubtitle: string;
  premiumPrice: string;
  premiumDuration: string;
  contactLink: string;
  footerText: string;
  heroTitle: string;
};

const DEFAULTS: UiConfig = {
  appName: "ICF ANIME",
  appLogo: "",
  adminTitle: "ICF Admin",
  adminSubtitle: "ICF Control Panel",
  loginTitle: "ICF ANIME",
  loginSubtitle: "Unlimited Series & Movies",
  premiumPrice: "৳100",
  premiumDuration: "30 Days Ad-Free Experience",
  contactLink: "https://t.me/najim_bhai9",
  footerText: "© 2026 ICF ANIME. All rights reserved.",
  heroTitle: "",
};

const UI_CONFIG_CACHE_KEY = "rs_ui_config_cache";

const readCachedUiConfig = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(UI_CONFIG_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
};

const writeCachedUiConfig = (config: Record<string, string>) => {
  try {
    localStorage.setItem(UI_CONFIG_CACHE_KEY, JSON.stringify(config));
  } catch {
    // ignore cache write errors
  }
};

export const useUiConfig = () => {
  const [raw, setRaw] = useState<Record<string, string>>(() => readCachedUiConfig());

  useEffect(() => {
    const unsub = onValue(
      ref(db, "settings/uiConfig"),
      (snap) => {
        const next = (snap.val() || {}) as Record<string, string>;
        setRaw(next);
        writeCachedUiConfig(next);
      },
      () => {
        setRaw((prev) => (Object.keys(prev).length > 0 ? prev : readCachedUiConfig()));
      },
    );
    return () => unsub();
  }, []);

  return useMemo<UiConfig>(() => {
    const appName = raw.appName?.trim() || DEFAULTS.appName;
    const currentYear = new Date().getFullYear();

    return {
      appName,
      appLogo: raw.appLogo?.trim() || DEFAULTS.appLogo,
      adminTitle: raw.adminTitle?.trim() || `${appName} Admin`,
      adminSubtitle: raw.adminSubtitle?.trim() || `${appName} Control Panel`,
      loginTitle: raw.loginTitle?.trim() || appName,
      loginSubtitle: raw.loginSubtitle?.trim() || DEFAULTS.loginSubtitle,
      premiumPrice: raw.premiumPrice?.trim() || DEFAULTS.premiumPrice,
      premiumDuration: raw.premiumDuration?.trim() || DEFAULTS.premiumDuration,
      contactLink: raw.contactLink?.trim() || DEFAULTS.contactLink,
      footerText: raw.footerText?.trim() || `© ${currentYear} ${appName}. All rights reserved.`,
      heroTitle: raw.heroTitle?.trim() || appName,
    };
  }, [raw]);
};