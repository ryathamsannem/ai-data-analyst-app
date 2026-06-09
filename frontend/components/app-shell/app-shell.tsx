"use client";

import {
  memo,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  MAIN_NAV_PAGE_TITLES,
  type MainNavTabId,
} from "@/app/components/home/main-nav-tabs";
import {
  persistSidebarCollapsed,
  readSidebarCollapsed,
} from "@/lib/sidebar-prefs";
import type { PilotNavTarget } from "@/lib/pilot-landing";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";

export const AppShell = memo(function AppShell({
  activeTab,
  onNavigate,
  datasetLoaded,
  onPilotNav,
  pilotNavActive,
  children,
}: {
  activeTab: MainNavTabId;
  onNavigate: (id: MainNavTabId) => void;
  datasetLoaded: boolean;
  onPilotNav?: (target: PilotNavTarget) => void;
  pilotNavActive?: PilotNavTarget | null;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    setCollapsed(readSidebarCollapsed());
    setPrefsReady(true);
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    persistSidebarCollapsed(collapsed);
  }, [collapsed, prefsReady]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const toggleCollapse = useCallback(() => {
    setCollapsed((c) => !c);
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 320);
    return () => window.clearTimeout(timer);
  }, [collapsed, prefsReady]);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

  const openMobile = useCallback(() => {
    setMobileOpen(true);
  }, []);

  return (
    <div className="app-shell flex min-h-screen w-full flex-row">
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] lg:hidden"
          aria-label="Close navigation menu"
          onClick={closeMobile}
        />
      ) : null}

      <AppSidebar
        activeTab={activeTab}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onNavigate={onNavigate}
        onToggleCollapse={toggleCollapse}
        onCloseMobile={closeMobile}
      />

      <div className="app-workspace">
        <AppHeader
          pageTitle={MAIN_NAV_PAGE_TITLES[activeTab]}
          datasetLoaded={datasetLoaded}
          onMenuClick={openMobile}
          onPilotNav={onPilotNav}
          pilotNavActive={pilotNavActive}
        />

        <main className="app-main-scroll">
          <div className="app-main-inner app-page-gutter">{children}</div>
        </main>
      </div>
    </div>
  );
});

AppShell.displayName = "AppShell";
