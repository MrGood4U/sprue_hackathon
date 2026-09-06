import { PrivyProvider, useLogin, usePrivy } from "@privy-io/react-auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getPublicAppConfig } from "../../services/api/public-config.js";
import { bootstrapIdentity } from "../../services/api/identity.js";

const AuthContext = createContext(null);

function accountLabel(user) {
  const accounts = user?.linkedAccounts ?? [];
  const account = accounts.find(
    (item) => item.email || item.username || item.address,
  );
  const label = account?.email || account?.username || account?.address;
  if (label)
    return label.length > 28
      ? `${label.slice(0, 12)}…${label.slice(-8)}`
      : label;
  return user?.id ? `${user.id.slice(0, 15)}…` : null;
}

function PrivySession({ children, appConfig }) {
  const {
    ready,
    authenticated,
    user,
    error: sdkError,
    getAccessToken,
    logout,
  } = usePrivy();
  const [identity, setIdentity] = useState(null);
  const [bootstrapStatus, setBootstrapStatus] = useState("idle");
  const [authError, setAuthError] = useState(null);
  const { login } = useLogin({
    onError(error) {
      setAuthError(error instanceof Error ? error : new Error("LOGIN_FAILED"));
    },
  });

  const initialize = useCallback(
    async (signal) => {
      setBootstrapStatus("loading");
      setAuthError(null);
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error("AUTH_REQUIRED");
        const nextIdentity = await bootstrapIdentity({ accessToken, signal });
        setIdentity(nextIdentity);
        setBootstrapStatus("ready");
      } catch (error) {
        if (error?.name === "AbortError") return;
        setIdentity(null);
        setAuthError(error);
        setBootstrapStatus("error");
      }
    },
    [getAccessToken],
  );

  useEffect(() => {
    if (!ready || !authenticated || !user?.id) {
      if (ready && !authenticated) {
        setIdentity(null);
        setBootstrapStatus("idle");
      }
      return undefined;
    }
    const controller = new AbortController();
    void initialize(controller.signal);
    return () => controller.abort();
  }, [authenticated, initialize, ready, user?.id]);

  const loginWith = useCallback(
    (method) => {
      setAuthError(null);
      login({
        loginMethods: [method],
        ...(method === "wallet" ? { walletChainType: "ethereum-only" } : {}),
      });
    },
    [login],
  );

  const signOut = useCallback(async () => {
    await logout();
    setIdentity(null);
    setBootstrapStatus("idle");
    setAuthError(null);
  }, [logout]);

  const status = !ready
    ? "loading"
    : sdkError || bootstrapStatus === "error"
      ? "error"
      : !authenticated
        ? "unauthenticated"
        : bootstrapStatus === "ready"
          ? "authenticated"
          : "initializing";

  const value = useMemo(
    () => ({
      status,
      configured: true,
      authenticated: status === "authenticated",
      appConfig,
      identity,
      accountLabel: accountLabel(user),
      error: authError ?? sdkError,
      loginWith,
      signOut,
      retry: () => initialize(),
    }),
    [
      appConfig,
      authError,
      identity,
      initialize,
      loginWith,
      sdkError,
      signOut,
      status,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }) {
  const [configuration, setConfiguration] = useState({
    status: "loading",
    appConfig: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    getPublicAppConfig({ signal: controller.signal })
      .then((body) =>
        setConfiguration({
          status: "ready",
          appConfig: body.data,
          error: null,
        }),
      )
      .catch((error) => {
        if (error?.name !== "AbortError")
          setConfiguration({ status: "error", appConfig: null, error });
      });
    return () => controller.abort();
  }, []);

  if (
    configuration.status !== "ready" ||
    !configuration.appConfig?.privyAppId
  ) {
    const value = {
      status: configuration.status === "loading" ? "loading" : "unavailable",
      configured: false,
      authenticated: false,
      appConfig: configuration.appConfig,
      identity: null,
      accountLabel: null,
      error: configuration.error,
      loginWith() {},
      async signOut() {},
      retry() {},
    };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  }

  return (
    <PrivyProvider
      appId={configuration.appConfig.privyAppId}
      config={{
        loginMethods: ["google", "github", "wallet"],
        appearance: {
          theme: "dark",
          walletList: ["metamask"],
          walletChainType: "ethereum-only",
        },
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          solana: { createOnLogin: "off" },
        },
      }}
    >
      <PrivySession appConfig={configuration.appConfig}>
        {children}
      </PrivySession>
    </PrivyProvider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
