import { createContext, useContext, useEffect, useMemo } from "react";
import { useAuth as useClerkAuth, useClerk, useUser } from "@clerk/react";
import { installTokenProvider } from "./authToken.js";
import { marketingHref } from "./siteUrls.js";

const AuthContext = createContext(null);
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
  const { isLoaded: authLoaded, getToken } = useClerkAuth();
  const clerk = useClerk();

  useEffect(() => {
    if (!authLoaded) return;
    return installTokenProvider(options => getToken(options));
  }, [authLoaded, getToken]);

  const user = useMemo(() => {
    if (!isLoaded || !authLoaded) return undefined;
    if (!clerkUser) return null;
    return {
      id: clerkUser.id,
      uid: clerkUser.id,
      email: clerkUser.primaryEmailAddress?.emailAddress || "",
      imageUrl: clerkUser.imageUrl,
    };
  }, [clerkUser, isLoaded, authLoaded]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading: user === undefined,
        signOut: () => clerk.signOut({ redirectUrl: marketingHref("/") }),
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
