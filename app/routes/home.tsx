import { ArrowRight, Clock, FolderPlus, Layers } from "lucide-react";
import NavBar from "../../components/NavBar";
import type { Route } from "./+types/home";
import Button from "../../components/ui/Button";
import Upload from "../../components/Upload";
import { useNavigate } from "react-router";
import { validateServerUploadBoundary } from "../../lib/constants";
import { useEffect, useRef, useState } from "react";
import { createProject, getProjects } from "../../lib/puter.action";

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
  const [projects, setProjects] = useState<DesignItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isCreatingProjectRef = useRef(false);

  const handleUploadComplete = async (base64Image: string) => {
    try {
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
      };

      const saved = await createProject({
        item: newItem,
        visibility: "private",
      });

      if (!saved) {
        console.error("Failed to create project");
        return false;
      }

      setProjects((prev) => [saved, ...prev]);
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
        const items = await getProjects();
        setProjects(items);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, []);

  return (
    <div className="home">
      <NavBar />
      <section className="hero">
        <div className="announce">
          <div className="dot">
            <div className="pulse"></div>
          </div>
          <p>Introducing Florepy 2.0</p>
        </div>
        <h1>Build beautiful spaces at the speed of thought with Florepy</h1>
        <p className="subtitle">
          Florepy is an AI-first design enviornment that helps you visualize,
          render and ship architectural projects faster than ever.
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
              <p>Supports JPG, PNG, and SVG vector formats up to 10MB</p>
            </div>
            <Upload onComplete={handleUploadComplete} />
          </div>
        </div>
      </section>

      <section className="projects">
        <div className="section-inner">
          <div className="section-head">
            <div className="copy">
              <h2>Projects</h2>
              <p>
                Your latest architectural generations and floor plan uploads.
              </p>
            </div>
          </div>
          {isLoading ? (
            <div className="projects-grid">
              {[1, 2, 3].map((i) => (
                <div key={i} className="project-card animate-pulse border border-zinc-100 bg-white shadow-sm overflow-hidden flex flex-col h-full">
                  <div className="preview aspect-4/3 bg-zinc-200 w-full relative"></div>
                  <div className="card-body p-4 flex justify-between items-end flex-grow border-t border-zinc-100">
                    <div className="w-full">
                      <div className="h-5 bg-zinc-200 rounded w-2/3 mb-3"></div>
                      <div className="h-4 bg-zinc-200 rounded w-1/2"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : projects.length > 0 ? (
            <div className="projects-grid">
              {projects.map(
                ({ id, name, renderedImage, sourceImage, timestamp }) => (
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
                          <span>
                            {new Date(timestamp).toLocaleDateString()}
                          </span>
                          <span>By SS</span>
                        </div>
                      </div>
                      <div className="arrow">
                        <ArrowRight size={18} />
                      </div>
                    </div>
                  </div>
                ),
              )}
            </div>
          ) : (
            <div className="empty-projects-state">
              <div className="empty-icon-wrap">
                <FolderPlus className="empty-icon" size={26} />
              </div>
              <h3>No projects created yet</h3>
              <p>
                Upload your first 2D floor plan above to start generating 3D
                architectural visualizations.
              </p>
              <a href="#upload" className="empty-cta">
                Upload Floor Plan <ArrowRight size={14} className="icon" />
              </a>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
