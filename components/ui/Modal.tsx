import React, { useEffect } from "react";
import { X } from "lucide-react";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | string;
  showCloseButton?: boolean;
  disabled?: boolean;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  icon,
  children,
  maxWidth = "sm",
  showCloseButton = true,
  disabled = false,
  className = "",
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !disabled) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, disabled, onClose]);

  if (!isOpen) return null;

  const maxWidthClass =
    maxWidth === "sm"
      ? "max-w-[360px]"
      : maxWidth === "md"
      ? "max-w-md"
      : maxWidth === "lg"
      ? "max-w-lg"
      : maxWidth === "xl"
      ? "max-w-xl"
      : maxWidth;

  return (
    <div
      className="fixed inset-0 z-60 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={() => !disabled && onClose()}
    >
      <div
        className={`bg-white rounded-xl border border-zinc-200/90 w-full p-5 relative transition-all ${maxWidthClass} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || icon || showCloseButton) && (
          <div className="flex items-start justify-between gap-3 pb-3 mb-3 border-b border-zinc-100">
            <div className="flex items-center gap-2.5">
              {icon && <div className="shrink-0">{icon}</div>}
              <div>
                {title && (
                  <h3 className="text-sm font-semibold text-zinc-900 leading-none">
                    {title}
                  </h3>
                )}
                {description && (
                  <p className="text-xs text-zinc-500 mt-1 leading-snug">
                    {description}
                  </p>
                )}
              </div>
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={() => !disabled && onClose()}
                disabled={disabled}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed -mr-1 -mt-1"
                aria-label="Close modal"
              >
                <X size={15} />
              </button>
            )}
          </div>
        )}

        {children}
      </div>
    </div>
  );
};

export default Modal;
