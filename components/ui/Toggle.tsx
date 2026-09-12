import React from "react";

export interface ToggleProps {
  checked: boolean;
  onChange?: (checked: boolean, e: React.MouseEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  activeLabel?: string;
  inactiveLabel?: string;
  variant?: "pill" | "minimal";
  className?: string;
  title?: string;
}

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  loading = false,
  label,
  activeLabel = "Public",
  inactiveLabel = "Private",
  variant = "pill",
  className = "",
  title,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled && !loading && onChange) {
      onChange(!checked, e);
    }
  };

  const displayText = loading
    ? "Saving..."
    : label ?? (checked ? activeLabel : inactiveLabel);

  if (variant === "minimal") {
    return (
      <div
        className={`flex items-center gap-1.5 cursor-pointer select-none py-1 group/toggle ${className}`}
        onClick={handleClick}
        title={
          title ||
          (checked
            ? `${activeLabel} - click to change`
            : `${inactiveLabel} - click to change`)
        }
      >
        {displayText && (
          <span
            className={`text-[11px] font-medium transition-colors ${
              checked
                ? "text-primary"
                : "text-zinc-400 group-hover/toggle:text-zinc-600"
            }`}
          >
            {displayText}
          </span>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled || loading}
          className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
            checked
              ? "bg-primary"
              : "bg-zinc-200 group-hover/toggle:bg-zinc-300"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow-xs transform transition duration-200 ease-in-out ${
              checked ? "translate-x-3.5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    );
  }

  // "pill" variant (default: floating glass pill)
  return (
    <div className={`inline-block ${className}`} onClick={handleClick}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled || loading}
        title={
          title ||
          (checked
            ? `${activeLabel} - click to make ${inactiveLabel}`
            : `${inactiveLabel} - click to make ${activeLabel}`)
        }
        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium backdrop-blur-md border shadow-xs transition-all duration-200 cursor-pointer ${
          checked
            ? "bg-white/95 text-primary border-primary/20 hover:bg-white hover:border-primary/40"
            : "bg-white/90 text-zinc-600 border-zinc-200/90 hover:bg-white hover:text-zinc-900"
        } ${disabled || loading ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        <span className="text-[11px] font-semibold tracking-wide">
          {displayText}
        </span>
        <span
          className={`relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors duration-200 ${
            checked ? "bg-primary" : "bg-zinc-300"
          }`}
        >
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full bg-white shadow-xs transform transition duration-200 ${
              checked ? "translate-x-3" : "translate-x-0.5"
            }`}
          />
        </span>
      </button>
    </div>
  );
};

export default Toggle;
