import { createContext, useContext, useEffect, useMemo } from "react";
import { useAuth as useClerkAuth, useClerk, useUser } from "@clerk/react";

const AuthContext = createContext(null);
let tokenProvider = async () => null;

export async function getAuthToken() {
  return tokenProvider();
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
    tokenProvider = () => getToken();
    return () => {
      tokenProvider = async () => null;
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
        signOut: () => clerk.signOut(),
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
