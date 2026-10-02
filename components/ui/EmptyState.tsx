import React from "react";
import { Link } from "react-router";
import { ArrowRight, FolderPlus } from "lucide-react";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  actionTo?: string;
  actionHref?: string;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = <FolderPlus size={24} />,
  title,
  description,
  actionText,
  onAction,
  actionTo,
  actionHref,
  className = "",
}) => {
  const ctaClasses =
    "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-1.5 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-semibold tracking-wide text-primary bg-primary/5 border border-primary/40 hover:border-primary hover:bg-primary/10 transition-all duration-200 shadow-xs cursor-pointer";

  return (
    <div
      className={`w-full rounded-2xl border border-zinc-200/80 bg-white p-8 sm:p-12 text-center flex flex-col items-center justify-center shadow-xs transition-all duration-300 my-4 ${className}`.trim()}
    >
      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-zinc-100/80 border border-zinc-200/60 flex items-center justify-center text-zinc-600 mb-4 shadow-xs">
        {icon}
      </div>
      <h3 className="text-xl md:text-2xl font-serif font-semibold text-zinc-900 mb-2 leading-snug">
        {title}
      </h3>
      <p className="text-xs sm:text-sm md:text-base text-zinc-500 max-w-md mx-auto mb-6 leading-relaxed">
        {description}
      </p>
      {actionText && (
        <>
          {actionTo ? (
            <Link to={actionTo} className={ctaClasses}>
              {actionText} <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </Link>
          ) : actionHref ? (
            <a href={actionHref} className={ctaClasses}>
              {actionText} <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </a>
          ) : onAction ? (
            <button type="button" onClick={onAction} className={ctaClasses}>
              {actionText} <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          ) : null}
        </>
      )}
    </div>
  );
};

export default EmptyState;
