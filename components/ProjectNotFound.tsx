import React from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Compass } from "lucide-react";
import { useAuth } from "./AuthProvider";
import Button from "./ui/Button";
import Pill from "./ui/Pill";

interface ProjectNotFoundProps {
  id?: string;
  className?: string;
}

export const ProjectNotFound: React.FC<ProjectNotFoundProps> = ({ id, className = "" }) => {
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();

  return (
    <div
      className={`w-full max-w-3xl mx-auto flex flex-col items-center justify-center text-center px-4 py-12 md:py-16 ${className}`.trim()}
    >
      {/* Pill Badge */}
      <Pill dotColor="amber" className="mb-3">
        Project Not Found
      </Pill>
      
      {/* 404 Architectural Blueprint Graphic */}
      <div className="relative mb-6 select-none">
        {/* Glow backdrop */}
        <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl transform scale-105 pointer-events-none" />

        <div className="relative w-32 h-32 md:w-36 md:h-36 rounded-2xl bg-white border border-zinc-200/90 shadow-xs p-3 flex items-center justify-center overflow-hidden">
          {/* Blueprint Grid Pattern */}
          <svg
            className="absolute inset-0 w-full h-full text-zinc-300"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 160 160"
          >
            <defs>
              <pattern
                id="blueprint-grid-sm"
                width="16"
                height="16"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 16 0 L 0 0 0 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="0.75"
                  strokeOpacity="0.4"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#blueprint-grid-sm)" />
            {/* Drafted blueprint walls */}
            <rect
              x="18"
              y="18"
              width="124"
              height="124"
              fill="none"
              stroke="#854d0e"
              strokeWidth="1.5"
              strokeDasharray="3 2"
              strokeOpacity="0.35"
            />
            <rect
              x="30"
              y="30"
              width="100"
              height="100"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeOpacity="0.4"
            />
            {/* Floor plan dividers */}
            <line
              x1="30"
              y1="80"
              x2="85"
              y2="80"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeOpacity="0.4"
            />
            <line
              x1="85"
              y1="30"
              x2="85"
              y2="130"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeOpacity="0.4"
            />
          </svg>

          {/* Central 404 Stamp */}
          <div className="relative z-10 flex flex-col items-center justify-center bg-white/95 backdrop-blur-xs px-3.5 py-2 rounded-xl border border-zinc-200/80 shadow-xs">
            <span className="font-mono text-[8px] uppercase tracking-widest text-primary font-semibold">
              Floor Plan
            </span>
            <span className="font-serif text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 leading-none my-0.5">
              404
            </span>
            <span className="text-[8px] font-mono uppercase tracking-wider text-zinc-400">
              Void
            </span>
          </div>

          {/* Compass / Architectural corner accent */}
          <div className="absolute top-2 right-2 text-zinc-400 opacity-60">
            <Compass size={13} />
          </div>
          <div className="absolute bottom-2 left-2 font-mono text-[8px] text-zinc-400">
            1:0
          </div>
        </div>
      </div>

      {/* Heading */}
      <h1 className="text-3xl md:text-5xl font-serif font-bold text-zinc-900 tracking-tight mb-4">
        Missing Visualization
      </h1>

      {/* Description */}
      <p className="text-zinc-600 text-sm md:text-base max-w-lg mx-auto leading-relaxed mb-3">
        We couldn&apos;t find the architectural project you&apos;re looking for.
        It may have been removed, set to private, or the link may be mistyped.
      </p>

      {/* ID info pill */}
      {id && (
        <Pill variant="mono" className="mb-8">
          <span className="text-zinc-400">ID:</span>
          <span className="text-zinc-800 font-semibold">{id}</span>
        </Pill>
      )}

      {/* Action CTA Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 w-full max-w-md">
        <Button
          size="md"
          variant="primary"
          onClick={() => navigate(isSignedIn ? "/dashboard" : "/")}
        >
          {isSignedIn ? "Go to Your Dashboard" : "Back to Home"}
        </Button>

        <Button
          size="md"
          variant="secondary"
          onClick={() => navigate("/community")}
        >
          Explore Community
        </Button>
      </div>

      {/* Go Back button */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mt-5 inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer"
      >
        <ArrowLeft size={13} />
        Go back to previous page
      </button>
    </div>
  );
};

export default ProjectNotFound;
