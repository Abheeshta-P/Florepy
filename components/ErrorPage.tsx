import { isRouteErrorResponse, useNavigate } from "react-router";
import NavBar from "./NavBar";
import Button from "./ui/Button";

export function ErrorPage({ error }: { error: unknown }) {
  let message = "Something went wrong";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;
  const navigate = useNavigate()

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Page Not Found" : "Error";
    details =
      error.status === 404
        ? "We couldn't find the page you were looking for. It might have been moved or deleted."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  const is404 = message === "Page Not Found";

  return (
    <main className="min-h-screen bg-background flex flex-col">
      <NavBar />

      <div className="flex-1 flex flex-col items-center justify-center p-6 mt-16">
        <div className="max-w-2xl w-full text-center space-y-6">
          {/* Custom SVG Graphic */}
          <svg
            className="w-48 h-48 mx-auto text-primary/40 mb-4"
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <pattern
              id="grid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeOpacity="0.3"
              />
            </pattern>
            <rect width="200" height="200" fill="url(#grid)" />
            <path
              d="M 40 40 L 160 40 L 160 160 L 40 160 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
            />
            <path
              d="M 100 40 L 100 100 L 160 100"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
            />
            <path
              d="M 40 100 L 70 100"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
            />

            {/* The red crack */}
            <path
              d="M 80 20 L 110 60 L 90 120 L 120 180"
              fill="none"
              stroke="#854d0e"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={0.6}
            />
          </svg>

          <h1 className="text-4xl md:text-5xl font-serif font-semibold leading-snug text-zinc-900">
            {is404 ? "404 Not Found" : message}
          </h1>
          <p className="text-zinc-600 leading-relaxed max-w-md mx-auto text-base">
            {details}
          </p>

          <Button size="md" variant="ghost" onClick={() => navigate("/")}>
            Return Home
          </Button>

          {stack && (
            <div className="mt-12 text-left">
              <pre className="w-full p-4 bg-zinc-900 text-zinc-100 rounded-lg overflow-x-auto text-xs leading-relaxed">
                <code>{stack}</code>
              </pre>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
