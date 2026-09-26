import React, { useState } from "react";
import { Image as ImageIcon } from "lucide-react";

export interface ProjectImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src?: string | null;
  alt?: string;
  className?: string;
  fallbackIcon?: React.ReactNode;
}

export const ProjectImage: React.FC<ProjectImageProps> = ({
  src,
  alt = "Project",
  className = "",
  fallbackIcon,
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <div className="relative w-full h-full bg-zinc-100 overflow-hidden">
      {/* Loading Skeleton */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 z-0 bg-zinc-200 animate-pulse flex items-center justify-center">
          {fallbackIcon || <ImageIcon className="w-8 h-8 text-zinc-300" />}
        </div>
      )}

      {/* Fallback when image is missing or failed to load */}
      {hasError || !src ? (
        <div className="absolute inset-0 z-0 bg-zinc-100 flex flex-col items-center justify-center text-zinc-400 p-4">
          {fallbackIcon || <ImageIcon className="w-8 h-8 text-zinc-300 mb-1" />}
          <span className="text-xs text-zinc-400 font-medium truncate max-w-[85%] text-center">
            {alt}
          </span>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          className={`w-full h-full object-cover transition-opacity duration-300 relative z-1 ${
            isLoaded ? "opacity-100" : "opacity-0"
          } ${className}`}
          {...props}
        />
      )}
    </div>
  );
};

export default ProjectImage;
