import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowRight, Clock, Globe, Loader2, Plus } from "lucide-react";
import { getCommunityProjects, syncMissingPublicProjects } from "../../lib/puter.action";
import { useAuth } from "../../components/AuthProvider";
import ProjectSkeleton from "../../components/ui/ProjectSkeleton";
import EmptyState from "../../components/ui/EmptyState";
import ProjectImage from "../../components/ui/ProjectImage";
import Pill from "../../components/ui/Pill";

export function meta() {
  return [
    { title: "Community - Florepy" },
    {
      name: "description",
      content:
        "Explore architectural visualizations shared by the Florepy community.",
    },
  ];
}

const BATCH_SIZE = 6;

export default function Community() {
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();
  const [projects, setProjects] = useState<DesignItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const handleCreateProject = () => {
    if (isSignedIn) {
      navigate("/dashboard", { state: { openUpload: true } });
    } else {
      navigate("/#upload");
    }
  };

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        if (isSignedIn) {
          await syncMissingPublicProjects();
        }
        const items = await getCommunityProjects();
        setProjects(items);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProjects();
  }, [isSignedIn]);

  const hasMore = visibleCount < projects.length;
  const visibleProjects = projects.slice(0, visibleCount);

  useEffect(() => {
    if (!hasMore || isLoading || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting) {
          setIsLoadingMore(true);
          setTimeout(() => {
            setVisibleCount((prev) =>
              Math.min(prev + BATCH_SIZE, projects.length),
            );
            setIsLoadingMore(false);
          }, 350);
        }
      },
      { rootMargin: "250px" },
    );

    const el = sentinelRef.current;
    if (el) observer.observe(el);

    return () => {
      if (el) observer.unobserve(el);
      observer.disconnect();
    };
  }, [hasMore, isLoading, isLoadingMore, projects.length]);

  return (
    <div className="community-page">
      {/* Hero */}
      <div className="community-hero">
        <div className="community-hero-inner">
          <Pill icon={<Globe size={13} className="text-primary" />} className="mb-6">
            Community
          </Pill>
          <h1>Community Projects</h1>
          <p>
            Explore architectural visualizations created and shared by the
            Florepy community.
          </p>
        </div>
      </div>

      {/* Grid */}
      <div className="community-body">
        {isLoading ? (
          <ProjectSkeleton count={6} />
        ) : projects.length > 0 ? (
          <>
            <div className="projects-grid">
              {visibleProjects.map(
                ({
                  id,
                  name,
                  renderedImage,
                  sourceImage,
                  timestamp,
                  ownerName,
                }) => (
                  <div
                    className="project-card group"
                    key={id}
                    onClick={() => navigate(`/visualizer/${id}`)}
                  >
                    <div className="preview">
                      <ProjectImage
                        src={renderedImage || sourceImage}
                        alt={name || "Project"}
                      />
                    </div>
                    <div className="card-body">
                      <div>
                        <h3>{name}</h3>
                        <div className="meta">
                          <Clock size={12} />
                          <span>{new Date(timestamp).toLocaleDateString()}</span>
                          <span>
                            {ownerName ? `By ${ownerName}` : "By Community Member"}
                          </span>
                        </div>
                      </div>
                      <div className="arrow">
                        <ArrowRight size={20} />
                      </div>
                    </div>
                  </div>
                ),
              )}
            </div>

            {/* Infinite Scroll Sentinel / Loader */}
            {hasMore ? (
              <div
                ref={sentinelRef}
                className="py-10 flex flex-col items-center justify-center gap-2 text-zinc-400"
              >
                {isLoadingMore ? (
                  <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
                    <Loader2 size={16} className="animate-spin text-zinc-900" />
                    <span>Loading more projects...</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleCount((prev) =>
                        Math.min(prev + BATCH_SIZE, projects.length),
                      )
                    }
                    className="text-xs font-medium text-zinc-500 hover:text-black hover:bg-zinc-100 border border-zinc-200 px-4 py-2 rounded-lg transition-colors cursor-pointer"
                  >
                    Load more projects
                  </button>
                )}
              </div>
            ) : projects.length > BATCH_SIZE ? (
              <div className="py-12 flex items-center justify-center text-xs text-zinc-400 font-medium">
                All {projects.length} community projects loaded
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState
            title="No community projects yet"
            description="Be the first to share your architectural visualization with the community."
            actionText="Create Project"
            onAction={handleCreateProject}
          />
        )}
      </div>
    </div>
  );
}
