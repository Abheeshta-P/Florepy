import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, Clock, Globe } from "lucide-react";
import { getProjects } from "../../lib/puter.action";

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
  const [projects, setProjects] = useState<DesignItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const items = await getProjects();
        // Only show projects that are marked public
        setProjects(items.filter((p) => Boolean(p.isPublic)));
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
          <div className="projects-grid">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="project-card animate-pulse border border-zinc-100 bg-white shadow-sm overflow-hidden flex flex-col h-full"
              >
                <div className="preview aspect-4/3 bg-zinc-200 w-full relative" />
                <div className="card-body p-4 flex justify-between items-end flex-grow border-t border-zinc-100">
                  <div className="w-full">
                    <div className="h-5 bg-zinc-200 rounded w-2/3 mb-3" />
                    <div className="h-4 bg-zinc-200 rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : projects.length > 0 ? (
          <div className="projects-grid">
            {projects.map(
              ({
                id,
                name,
                renderedImage,
                sourceImage,
                timestamp,
                sharedBy,
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
                    <span className="badge badge-public">
                      <Globe size={11} /> Public
                    </span>
                  </div>
                  <div className="card-body">
                    <div>
                      <h3>{name}</h3>
                      <div className="meta">
                        <Clock size={12} />
                        <span>{new Date(timestamp).toLocaleDateString()}</span>
                        <span>
                          {sharedBy ? `By ${sharedBy}` : "By Creator"}
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
          <div className="empty-projects-state">
            <div className="empty-icon-wrap">
              <Globe className="empty-icon" size={26} />
            </div>
            <h3>No community projects yet</h3>
            <p>
              Be the first to share your architectural visualization with the
              community.
            </p>
            <Link to="/" className="empty-cta">
              Upload Floor Plan <ArrowRight size={14} className="icon" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
