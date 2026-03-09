"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

interface ApiKeyState {
  /** Whether the server has a built-in API key */
  hasServerKey: boolean;
  /** User-provided key (stored in sessionStorage) */
  userApiKey: string;
  /** Whether an effective key is available (server or user) */
  hasEffectiveKey: boolean;
  /** Whether the config has been loaded */
  configLoaded: boolean;
  /** Set the user-provided API key */
  setUserApiKey: (key: string) => void;
  /** Clear the user-provided API key */
  clearUserApiKey: () => void;
  /** Get headers to include in API calls */
  getAuthHeaders: () => Record<string, string>;
}

const ApiKeyContext = createContext<ApiKeyState>({
  hasServerKey: true,
  userApiKey: "",
  hasEffectiveKey: true,
  configLoaded: false,
  setUserApiKey: () => {},
  clearUserApiKey: () => {},
  getAuthHeaders: () => ({}),
});

const SESSION_STORAGE_KEY = "reposhift-api-key";

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  const [hasServerKey, setHasServerKey] = useState(true); // optimistic default
  const [userApiKey, setUserApiKeyState] = useState("");
  const [configLoaded, setConfigLoaded] = useState(false);

  // Load config on mount
  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        setHasServerKey(data.hasServerKey);
        setConfigLoaded(true);
      })
      .catch(() => {
        // If config fails, assume server key exists (self-hosted mode)
        setConfigLoaded(true);
      });
  }, []);

  // Restore user key from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) setUserApiKeyState(saved);
    } catch {
      // sessionStorage not available (SSR)
    }
  }, []);

  const setUserApiKey = useCallback((key: string) => {
    setUserApiKeyState(key);
    try {
      if (key) {
        sessionStorage.setItem(SESSION_STORAGE_KEY, key);
      } else {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch {
      // sessionStorage not available
    }
  }, []);

  const clearUserApiKey = useCallback(() => {
    setUserApiKeyState("");
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // sessionStorage not available
    }
  }, []);

  const hasEffectiveKey = hasServerKey || userApiKey.length > 0;

  const getAuthHeaders = useCallback((): Record<string, string> => {
    if (!hasServerKey && userApiKey) {
      return { "x-api-key": userApiKey };
    }
    return {};
  }, [hasServerKey, userApiKey]);

  return (
    <ApiKeyContext.Provider
      value={{
        hasServerKey,
        userApiKey,
        hasEffectiveKey,
        configLoaded,
        setUserApiKey,
        clearUserApiKey,
        getAuthHeaders,
      }}
    >
      {children}
    </ApiKeyContext.Provider>
  );
}

export function useApiKey() {
  return useContext(ApiKeyContext);
}
