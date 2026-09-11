import { createContext, useContext, useEffect, useMemo } from "react";
import { useAuth as useClerkAuth, useClerk, useUser } from "@clerk/react";

const AuthContext = createContext(null);
let tokenProvider = null;
let resolveTokenProviderReady;
let tokenProviderReady = new Promise(resolve => { resolveTokenProviderReady = resolve; });

function resetTokenProvider() {
  tokenProviderReady = new Promise(resolve => { resolveTokenProviderReady = resolve; });
}

export async function getAuthToken() {
  if (!tokenProvider) await tokenProviderReady;
  return tokenProvider ? tokenProvider() : null;
}

export function AuthProvider({ children }) {
  if (import.meta.env.VITE_BRIDGE_LOCAL_PREVIEW === "true") {
    return (
      <AuthContext.Provider
        value={{
          user: null,
          loading: false,
          signOut: async () => {},
          getIdToken: async () => null,
        }}
      >
        {children}
      </AuthContext.Provider>
    );
  }

  return <ClerkAuthProvider>{children}</ClerkAuthProvider>;
}

function ClerkAuthProvider({ children }) {
  const { isLoaded, user: clerkUser } = useUser();
  const { getToken } = useClerkAuth();
  const clerk = useClerk();

  useEffect(() => {
    const provider = () => getToken();
    tokenProvider = provider;
    resolveTokenProviderReady();
    return () => {
      if (tokenProvider === provider) {
        tokenProvider = null;
        resetTokenProvider();
      }
    };
  }, [getToken]);

  const user = useMemo(() => {
    if (!isLoaded) return undefined;
    if (!clerkUser) return null;
    return {
      id: clerkUser.id,
      uid: clerkUser.id,
      email: clerkUser.primaryEmailAddress?.emailAddress || "",
      imageUrl: clerkUser.imageUrl,
    };
  }, [clerkUser, isLoaded]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading: user === undefined,
        signOut: () => clerk.signOut({ redirectUrl: "/" }),
        getIdToken: getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}
