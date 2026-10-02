import React from "react";

export interface PillProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  icon?: React.ReactNode;
  dotColor?: "primary" | "amber" | "red" | "emerald" | "zinc";
  pulse?: boolean;
  variant?: "default" | "mono";
  className?: string;
}

const DOT_COLORS: Record<string, { bg: string; dot: string }> = {
  primary: { bg: "bg-primary/20", dot: "bg-primary" },
  amber: { bg: "bg-amber-500/20", dot: "bg-amber-600" },
  red: { bg: "bg-red-500/20", dot: "bg-red-600" },
  emerald: { bg: "bg-emerald-500/20", dot: "bg-emerald-600" },
  zinc: { bg: "bg-zinc-200", dot: "bg-zinc-500" },
};

export const Pill: React.FC<PillProps> = ({
  children,
  icon,
  dotColor,
  pulse = true,
  variant = "default",
  className = "",
  ...props
}) => {
  const dotConfig = dotColor ? DOT_COLORS[dotColor] || DOT_COLORS.primary : null;

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-zinc-200 shadow-xs text-zinc-600 select-none ${
        variant === "mono"
          ? "font-mono text-xs"
          : "text-[10px] sm:text-[11px] font-bold uppercase tracking-widest"
      } ${className}`.trim()}
      {...props}
    >
      {dotConfig ? (
        <span
          className={`w-3.5 h-3.5 rounded-full ${dotConfig.bg} flex items-center justify-center shrink-0`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${dotConfig.dot} ${
              pulse ? "animate-pulse" : ""
            }`}
          />
        </span>
      ) : icon ? (
        <span className="shrink-0 flex items-center justify-center">{icon}</span>
      ) : null}
      <span>{children}</span>
    </div>
  );
};

export default Pill;
