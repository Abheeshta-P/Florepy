import React from "react";

interface ProjectSkeletonProps {
  count?: number;
  className?: string;
}

export const ProjectSkeleton: React.FC<ProjectSkeletonProps> = ({
  count = 3,
  className = "",
}) => {
  return (
    <div className={`projects-grid ${className}`.trim()}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="project-card animate-pulse border border-zinc-100 bg-white shadow-sm overflow-hidden flex flex-col h-full"
        >
          <div className="preview aspect-4/3 bg-zinc-200 w-full relative" />
          <div className="card-body p-4 flex justify-between items-end grow border-t border-zinc-100">
            <div className="w-full">
              <div className="h-5 bg-zinc-200 rounded w-2/3 mb-3" />
              <div className="h-4 bg-zinc-200 rounded w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ProjectSkeleton;
