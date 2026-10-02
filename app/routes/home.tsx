import { ArrowRight, Clock, FolderPlus, Layers } from "lucide-react";
import type { Route } from "./+types/home";
import Button from "../../components/ui/Button";
import Upload from "../../components/Upload";
import ProjectSkeleton from "../../components/ui/ProjectSkeleton";
import EmptyState from "../../components/ui/EmptyState";
import ProjectImage from "../../components/ui/ProjectImage";
import { Link, useNavigate } from "react-router";
import { useEffect, useRef, useState } from "react";
import { validateServerUploadBoundary } from "../../lib/constants";
import {
  createProject,
  getCommunityProjects,
  syncMissingPublicProjects,
} from "../../lib/puter.action";
import { useAuth } from "../../components/AuthProvider";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Florepy - AI Floor Plan to 3D Architectural Visualization" },
    {
      name: "description",
      content:
        "Transform your 2D floor plans into photorealistic 3D architectural visualizations in seconds using advanced AI. Built for architects, designers, and real estate professionals.",
    },
    {
      name: "keywords",
      content:
        "AI floor plan, 3D architectural visualization, floor plan to 3D, architecture AI, 3D render, interior design AI, real estate visualization",
    },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Florepy" },
    {
      property: "og:title",
      content: "Florepy - AI Floor Plan to 3D Architectural Visualization",
    },
    {
      property: "og:description",
      content:
        "Transform your 2D floor plans into photorealistic 3D architectural visualizations in seconds using advanced AI.",
    },
    { property: "og:image", content: "/og-image.png" },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: "Florepy architectural AI preview" },
    { name: "twitter:card", content: "summary_large_image" },
    {
      name: "twitter:title",
      content: "Florepy - AI Floor Plan to 3D Architectural Visualization",
    },
    {
      name: "twitter:description",
      content:
        "Transform your 2D floor plans into photorealistic 3D architectural visualizations in seconds using advanced AI.",
    },
    { name: "twitter:image", content: "/og-image.png" },
    { name: "twitter:image:alt", content: "Florepy architectural AI preview" },
  ];
}

export default function Home() {
  const navigate = useNavigate();
  const { isSignedIn, signIn, userName, userId } = useAuth();
  const [projects, setProjects] = useState<DesignItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isCreatingProjectRef = useRef(false);

  const handleUploadComplete = async (base64Image: string) => {
    try {
      if (!isSignedIn) {
        const loggedIn = await signIn();
        if (!loggedIn) return false;
      }

      if (isCreatingProjectRef.current) return false;
      isCreatingProjectRef.current = true;

      const validation = await validateServerUploadBoundary(base64Image);
      if (!validation.valid) {
        console.error(
          "Upload rejected at server validation boundary:",
          validation.error,
        );
        return { success: false, error: validation.error };
      }
      const newId = Date.now().toString();
      const name = `Residence ${newId}`;

      // project
      const newItem = {
        id: newId,
        name,
        sourceImage: base64Image,
        renderedImage: undefined,
        timestamp: Date.now(),
        ownerId: userId ?? null,
        ownerName: userName ?? null,
        isPublic: false,
      };

      const saved = await createProject({
        item: newItem,
        isPublic: false,
      });

      if (!saved) {
        console.error("Failed to create project");
        return false;
      }

      navigate(`/visualizer/${newId}`, {
        state: {
          intialImage: saved.sourceImage,
          intialRendered: saved.renderedImage || null,
          name,
        },
      });

      return true;
    } finally {
      isCreatingProjectRef.current = false;
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

  return (
    <div className="home">
      <section className="hero">
        <div className="announce">
          <div className="dot">
            <div className="pulse"></div>
          </div>
          <p>Introducing Florepy 2.0</p>
        </div>
        <h1>Build beautiful spaces at the speed of thought with Florepy</h1>
        <p className="subtitle">
          Upload your 2D floor plan, let our AI render a photorealistic 3D
          visualization, then compare and export. Built for architects,
          designers, and real estate professionals.
        </p>

        <div className="actions">
          <a href="#upload" className="cta">
            Start Building <ArrowRight className="icon" />
          </a>
          <Button variant="outline" size="lg" className="demo">
            Watch Demo
          </Button>
        </div>

        <div className="upload-shell" id="upload">
          <div className="grid-overlay" />
          <div className="upload-card">
            <div className="upload-head">
              <div className="upload-icon">
                <Layers className="icon" />
              </div>
              <h3>Upload your floor plan</h3>
              <p>Supports JPG, PNG, WEBP, and SVG formats up to 10MB</p>
            </div>
            <Upload onComplete={handleUploadComplete} />
          </div>
        </div>
      </section>

      <section className="projects" id="gallery">
        <div className="section-inner">
          <div className="section-head">
            <div className="copy">
              <h2>Community Projects</h2>
              <p>
                Explore public architectural visualizations shared by the
                Florepy community.
              </p>
            </div>
          </div>
          {isLoading ? (
            <ProjectSkeleton count={3} />
          ) : projects.length > 0 ? (
            <>
              <div className="projects-grid">
                {[...projects]
                  .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                  .slice(0, 3)
                  .map(
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
                              <span>
                                {new Date(timestamp).toLocaleDateString()}
                              </span>
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
              <div className="flex justify-center mt-10">
                <Link
                  to="/community"
                  className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-zinc-600 hover:text-black transition-colors border border-zinc-200 hover:border-zinc-400 px-4 py-2 sm:px-6 sm:py-2.5 rounded-lg bg-white shadow-xs"
                >
                  See all community projects <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </Link>
              </div>
            </>
          ) : (
            <EmptyState
              title="No community projects yet"
              description="Be the first to share your architectural visualization with the community."
              actionText="Upload Floor Plan"
              actionHref="#upload"
            />
          )}
        </div>
      </section>
    </div>
  );
}
