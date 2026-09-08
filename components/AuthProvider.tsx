import { createContext, useContext, useEffect, useState } from "react";
import { getCurrentUser, signIn as puterSignIn, signOut as puterSignOut } from "../lib/puter.action";

export const AuthContextReact = createContext<AuthContext | null>(null);

const DEFAULT_AUTH_STATE: AuthState = {
  isSignedIn: false,
  isAuthLoading: true,
  userName: null,
  userId: null
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>(DEFAULT_AUTH_STATE);

  const refreshAuth = async () => {
    try {
      const user = await getCurrentUser();

      setAuthState({
        isSignedIn: !!user,
        isAuthLoading: false,
        userName: user?.username || null,
        userId: user?.uuid || null,
      });

      return !!user;
    } catch {
      setAuthState({ ...DEFAULT_AUTH_STATE, isAuthLoading: false });
      return false;
    }
  };

  useEffect(() => {
    refreshAuth();

    let unsubscribe: (() => void) | undefined;
    
    if (typeof window !== "undefined") {
      import("@heyputer/puter.js").then((module) => {
        const puter = module.default;
        unsubscribe = puter.onAuthStateChanged(() => {
          refreshAuth();
        });
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);
  
  const signIn = async () => {
    await puterSignIn();
    return await refreshAuth();
  };

  const signOut = async () => {
    puterSignOut();
    return await refreshAuth();
  };

  return (
    <AuthContextReact.Provider value={{ ...authState, refreshAuth, signIn, signOut }}>
      {children}
    </AuthContextReact.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContextReact);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
