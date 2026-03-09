"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";

// ----------------------------------------------------------
// Types
// ----------------------------------------------------------

interface ProviderAuth {
  token: string;
  user: string;
  avatar?: string;
}

interface AuthState {
  github: ProviderAuth | null;
  azdo: ProviderAuth | null;
  /** Which OAuth providers are configured on the server */
  oauthProviders: { github: boolean; azdo: boolean };
  /** Connect via GitHub OAuth popup */
  connectGitHub: () => void;
  /** Connect via Azure DevOps OAuth popup */
  connectAzDo: () => void;
  /** Disconnect GitHub */
  disconnectGitHub: () => void;
  /** Disconnect Azure DevOps */
  disconnectAzDo: () => void;
  /** Get the repo access token for a given provider */
  getRepoToken: (provider: "github" | "azure-devops") => string | undefined;
}

const AuthContext = createContext<AuthState>({
  github: null,
  azdo: null,
  oauthProviders: { github: false, azdo: false },
  connectGitHub: () => {},
  connectAzDo: () => {},
  disconnectGitHub: () => {},
  disconnectAzDo: () => {},
  getRepoToken: () => undefined,
});

// ----------------------------------------------------------
// Session storage keys
// ----------------------------------------------------------

const GH_TOKEN_KEY = "reposhift-github-token";
const GH_USER_KEY = "reposhift-github-user";
const GH_AVATAR_KEY = "reposhift-github-avatar";
const AZDO_TOKEN_KEY = "reposhift-azdo-token";
const AZDO_USER_KEY = "reposhift-azdo-user";

function ssGet(key: string): string {
  try {
    return sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function ssSet(key: string, value: string) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // SSR or storage blocked
  }
}

function ssRemove(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {}
}

// ----------------------------------------------------------
// Provider
// ----------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [github, setGitHub] = useState<ProviderAuth | null>(null);
  const [azdo, setAzDo] = useState<ProviderAuth | null>(null);
  const [oauthProviders, setOauthProviders] = useState({ github: false, azdo: false });

  const popupRef = useRef<Window | null>(null);

  // Restore from sessionStorage on mount
  useEffect(() => {
    const ghToken = ssGet(GH_TOKEN_KEY);
    if (ghToken) {
      setGitHub({
        token: ghToken,
        user: ssGet(GH_USER_KEY),
        avatar: ssGet(GH_AVATAR_KEY) || undefined,
      });
    }
    const azdoToken = ssGet(AZDO_TOKEN_KEY);
    if (azdoToken) {
      setAzDo({
        token: azdoToken,
        user: ssGet(AZDO_USER_KEY),
      });
    }
  }, []);

  // Fetch OAuth provider availability from /api/config
  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.oauthProviders) {
          setOauthProviders(data.oauthProviders);
        }
      })
      .catch(() => {});
  }, []);

  // Listen for postMessage from OAuth popup
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // Only accept messages from our own origin
      if (event.origin !== window.location.origin) return;

      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.provider === "github" && data.token) {
        const auth: ProviderAuth = {
          token: data.token,
          user: data.user || "",
          avatar: data.avatar || undefined,
        };
        setGitHub(auth);
        ssSet(GH_TOKEN_KEY, auth.token);
        ssSet(GH_USER_KEY, auth.user);
        ssSet(GH_AVATAR_KEY, auth.avatar || "");
        popupRef.current?.close();
      }

      if (data.provider === "azure-devops" && data.token) {
        const auth: ProviderAuth = {
          token: data.token,
          user: data.user || "",
        };
        setAzDo(auth);
        ssSet(AZDO_TOKEN_KEY, auth.token);
        ssSet(AZDO_USER_KEY, auth.user);
        popupRef.current?.close();
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const connectGitHub = useCallback(() => {
    const w = 500;
    const h = 700;
    const left = window.screenX + (window.innerWidth - w) / 2;
    const top = window.screenY + (window.innerHeight - h) / 2;
    popupRef.current = window.open(
      "/api/auth/github",
      "github-oauth",
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`
    );
  }, []);

  const connectAzDo = useCallback(() => {
    const w = 500;
    const h = 700;
    const left = window.screenX + (window.innerWidth - w) / 2;
    const top = window.screenY + (window.innerHeight - h) / 2;
    popupRef.current = window.open(
      "/api/auth/azure-devops",
      "azdo-oauth",
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`
    );
  }, []);

  const disconnectGitHub = useCallback(() => {
    setGitHub(null);
    ssRemove(GH_TOKEN_KEY);
    ssRemove(GH_USER_KEY);
    ssRemove(GH_AVATAR_KEY);
  }, []);

  const disconnectAzDo = useCallback(() => {
    setAzDo(null);
    ssRemove(AZDO_TOKEN_KEY);
    ssRemove(AZDO_USER_KEY);
  }, []);

  const getRepoToken = useCallback(
    (provider: "github" | "azure-devops"): string | undefined => {
      if (provider === "github") return github?.token;
      if (provider === "azure-devops") return azdo?.token;
      return undefined;
    },
    [github, azdo]
  );

  return (
    <AuthContext.Provider
      value={{
        github,
        azdo,
        oauthProviders,
        connectGitHub,
        connectAzDo,
        disconnectGitHub,
        disconnectAzDo,
        getRepoToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
