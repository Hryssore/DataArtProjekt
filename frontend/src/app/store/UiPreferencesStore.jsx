import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { useAuth } from "./AuthStore.jsx";

const THEME_STORAGE_KEY = "classic-web-chat-theme";
const RECENT_ROOMS_PREFIX = "classic-web-chat-recent-rooms";
const MAX_RECENT_ROOMS = 8;

const UiPreferencesContext = createContext(null);

function getRecentRoomsStorageKey(userId) {
  return `${RECENT_ROOMS_PREFIX}:${userId ?? "guest"}`;
}

function readJson(key, fallback) {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_error) {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (_error) {
    // Ignore local persistence failures and keep the in-memory state alive.
  }
}

function readTheme() {
  if (typeof window === "undefined") {
    return "light";
  }

  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  return saved === "dark" ? "dark" : "light";
}

function sanitizeRecentRooms(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(item => item && typeof item.id === "string" && typeof item.name === "string")
    .map(item => ({
      id: item.id,
      name: item.name,
      category: item.category || "general",
      visibility: item.visibility || "public",
      visitedAt: item.visitedAt || new Date().toISOString(),
    }))
    .slice(0, MAX_RECENT_ROOMS);
}

export function UiPreferencesProvider({ children }) {
  const auth = useAuth();
  const [theme, setThemeState] = useState(readTheme);
  const [recentRooms, setRecentRooms] = useState([]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light";
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const userId = auth.user?.id ?? null;
    const savedRooms = readJson(getRecentRoomsStorageKey(userId), []);
    setRecentRooms(sanitizeRecentRooms(savedRooms));
  }, [auth.user?.id]);

  const value = useMemo(
    () => ({
      theme,
      isDarkTheme: theme === "dark",
      setTheme(nextTheme) {
        setThemeState(nextTheme === "dark" ? "dark" : "light");
      },
      toggleTheme() {
        setThemeState(current => (current === "dark" ? "light" : "dark"));
      },
      recentRooms,
      rememberRoomVisit(room) {
        if (!room?.id || !room?.name) {
          return;
        }

        setRecentRooms(current => {
          const next = [
            {
              id: room.id,
              name: room.name,
              category: room.category || "general",
              visibility: room.visibility || "public",
              visitedAt: new Date().toISOString(),
            },
            ...current.filter(item => item.id !== room.id),
          ].slice(0, MAX_RECENT_ROOMS);

          writeJson(getRecentRoomsStorageKey(auth.user?.id ?? null), next);
          return next;
        });
      },
      clearRecentRooms() {
        setRecentRooms([]);
        writeJson(getRecentRoomsStorageKey(auth.user?.id ?? null), []);
      },
    }),
    [auth.user?.id, recentRooms, theme],
  );

  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>;
}

export function useUiPreferences() {
  const context = useContext(UiPreferencesContext);
  if (!context) {
    throw new Error("useUiPreferences must be used inside UiPreferencesProvider");
  }

  return context;
}
