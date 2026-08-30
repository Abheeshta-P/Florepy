import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { useEffect, useState } from "react";
import { getCurrentUser, signIn as puterSignIn, signOut as puterSignOut } from "../lib/puter.action";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
  { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
  { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
  { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
  { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
  { rel: "manifest", href: "/site.webmanifest" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#ffffff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Florepy" />
        <meta name="application-name" content="Florepy" />
        <meta name="msapplication-TileColor" content="#ffffff" />
        <Meta />
        <Links />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "Florepy",
              applicationCategory: "DesignApplication",
              operatingSystem: "Web, Windows, macOS, iOS, Android",
              description:
                "Transform your 2D floor plans into photorealistic 3D architectural visualizations using AI.",
              offers: {
                "@type": "Offer",
                price: "0.00",
                priceCurrency: "USD",
              },
            }),
          }}
        />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

const DEFAULT_AUTH_STATE: AuthState = {
  isSignedIn: false,
  userName: null,
  userId: null
}

export default function App() {
  const [authState, setAuthState] = useState<AuthState>(DEFAULT_AUTH_STATE);

  const refreshAuth = async () => {
    try {
      const user = await getCurrentUser();

      setAuthState({
        isSignedIn: !!user,
        userName: user?.username || null,
        userId: user?.uuid || null,
      })

      return !!user;
    } catch {
      setAuthState(DEFAULT_AUTH_STATE);
      return false;
    }
  }

  // get current user
  useEffect(() => {
    refreshAuth();

    let unsubscribe: (() => void) | undefined;
    
    // Puter restores sessions asynchronously. Listen for when auth state changes 
    // to automatically log the user in without them needing to click anything.
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
  }

  const signOut = async () => {
    puterSignOut();
    return await refreshAuth();
  }

  return (
    <main className="min-h-screen bg-background text-foreground relative z-10">
      <Outlet context={{
        ...authState,
        refreshAuth,
        signIn,
        signOut
      }}/>;
    </main>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
