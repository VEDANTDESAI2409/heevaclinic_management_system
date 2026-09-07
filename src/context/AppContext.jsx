// ─── HEEVA CLINIC — global app context ─────────────────────────────────────
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import db, { syncFromBackend } from '../db';
import { getHealth, authApi } from '../services/api';
import { isBrowserRuntime } from '../lib/remoteSync';
import { getSettings, DEFAULT_SETTINGS } from '../services/core';
import { ensureMedicineCategories } from '../services/inventory';
import { syncAlerts, unreadCount } from '../services/notifications';
import { makeT } from '../i18n';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const LOCAL_USER = { id: 'local-admin', name: 'Administrator', role: 'admin', active: 1 };

export function AppProvider({ children }) {
  const [booting, setBooting] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [databaseError, setDatabaseError] = useState(null);
  const [user] = useState(LOCAL_USER);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [theme, setThemeState] = useState('light');
  const [lang, setLangState] = useState('en');
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [toasts, setToasts] = useState([]);
  const [installEvt, setInstallEvt] = useState(null);
  const [standalone, setStandalone] = useState(false);
  const [notifCount, setNotifCount] = useState(0);

  const refreshNotifs = useCallback(async () => {
    try { setNotifCount(await unreadCount()); } catch (e) { /* ignore */ }
  }, []);

  const syncAndInit = useCallback(async () => {
    try {
      if (isBrowserRuntime()) {
        await syncFromBackend(db);
        setDatabaseError(null);
      }
      await ensureMedicineCategories();
      const s = await getSettings();
      setSettings(s);
      setThemeState(s.theme || 'light');
      setLangState(s.lang || 'en');
      globalThis.__heevaUser = LOCAL_USER;
      try { await syncAlerts(LOCAL_USER.id); } catch (e) { /* ignore */ }
      refreshNotifs();
    } catch (e) {
      console.error('Initialization error', e);
      throw e;
    }
  }, [refreshNotifs]);

  // boot: healthcheck → verify existing auth token → conditionally sync
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (isBrowserRuntime()) {
          await getHealth();
          setDatabaseError(null);
        }

        const isValidSession = await authApi.verify();
        if (mounted) {
          if (isValidSession) {
            setIsAuthenticated(true);
            await syncAndInit();
          } else {
            setIsAuthenticated(false);
          }
        }
      } catch (e) {
        console.error('Backend boot error', e);
        if (mounted) {
          setDatabaseError(e?.message || 'Unable to connect to the backend server.');
        }
      } finally {
        if (mounted) {
          setBooting(false);
        }
      }
    })();

    const onUnauthorized = () => {
      setIsAuthenticated(false);
    };
    window.addEventListener('heeva:unauthorized', onUnauthorized);

    const on = () => { setOnline(true); syncFromBackend(db).catch(() => {}); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const bip = (e) => { e.preventDefault(); setInstallEvt(e); };
    const ai = () => setInstallEvt(null);
    window.addEventListener('beforeinstallprompt', bip);
    window.addEventListener('appinstalled', ai);
    const mq = window.matchMedia('(display-mode: standalone)');
    setStandalone(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', (e) => setStandalone(e.matches));

    const onFocusSync = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        syncFromBackend(db).catch(() => {});
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onFocusSync);
    }
    window.addEventListener('focus', onFocusSync);

    // Multi-laptop background sync: poll shared D1 database every 8s while active
    const pollInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        syncFromBackend(db).catch(() => {});
      }
    }, 8000);

    return () => {
      mounted = false;
      clearInterval(pollInterval);
      window.removeEventListener('heeva:unauthorized', onUnauthorized);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('beforeinstallprompt', bip);
      window.removeEventListener('appinstalled', ai);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onFocusSync);
      }
      window.removeEventListener('focus', onFocusSync);
    };
  }, [syncAndInit]);

  const login = useCallback(async (password) => {
    const res = await authApi.login(password);
    setIsAuthenticated(true);
    await syncAndInit();
    return res;
  }, [syncAndInit]);

  const logout = useCallback(async () => {
    await authApi.logout();
    setIsAuthenticated(false);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const t = useMemo(() => makeT(lang), [lang]);

  const install = useCallback(async () => {
    if (!installEvt) return false;
    installEvt.prompt();
    const choice = await installEvt.userChoice;
    if (choice.outcome === 'accepted') setInstallEvt(null);
    return choice.outcome === 'accepted';
  }, [installEvt]);

  const pushToast = useCallback((type, msg, ms = 4000) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((ts) => [...ts.slice(-4), { id, type, msg }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), ms);
  }, []);

  const updateSettings = useCallback(async (patch) => {
    await db.transaction('rw', [db.settings, db.activity_logs], async () => {
      for (const [k, v] of Object.entries(patch)) await db.settings.put({ key: k, value: v });
    });
    const fresh = await getSettings();
    setSettings(fresh);
    if (patch.theme) setThemeState(fresh.theme || 'light');
    if (patch.lang) setLangState(fresh.lang || 'en');
    return fresh;
  }, []);

  const setTheme = useCallback((th) => {
    setThemeState(th);
    db.settings.put({ key: 'theme', value: th });
  }, []);

  const setLang = useCallback((l) => {
    setLangState(l);
    db.settings.put({ key: 'lang', value: l });
  }, []);

  const can = useCallback(() => true, []);

  const value = {
    booting, isAuthenticated, login, logout,
    databaseError, user,
    settings, updateSettings,
    theme, setTheme, lang, setLang, t,
    online, toasts, pushToast,
    install, installEvt, standalone,
    notifCount, refreshNotifs,
    can,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
