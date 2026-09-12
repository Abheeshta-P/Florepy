import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, Clock, Globe, Plus } from "lucide-react";
import { getCommunityProjects } from "../../lib/puter.action";
import { useAuth } from "../../components/AuthProvider";
import Button from "../../components/ui/Button";
import ProjectSkeleton from "../../components/ui/ProjectSkeleton";
import EmptyState from "../../components/ui/EmptyState";

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

export default function Community() {
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();
  const [projects, setProjects] = useState<DesignItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
        const items = await getCommunityProjects();
        setProjects(items);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProjects();
  }, []);

  return (
    <div className="community-page">
      {/* Hero */}
      <div className="community-hero">
        <div className="community-hero-inner">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-white border border-zinc-200 text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-6">
            <Globe size={12} /> Community
          </div>
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
          <div className="projects-grid">
            {projects.map(
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
                    <img
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
