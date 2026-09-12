import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, Clock, FolderPlus, Plus, X } from "lucide-react";
import Button from "../../components/ui/Button";
import Toggle from "../../components/ui/Toggle";
import Upload from "../../components/Upload";
import { useAuth } from "../../components/AuthProvider";
import {
  getProjects,
  createProject,
  toggleProjectVisibility,
} from "../../lib/puter.action";
import { validateServerUploadBoundary } from "../../lib/constants";

export function meta() {
  return [{ title: "Dashboard - Florepy" }];
}

export default function Dashboard() {
  const { isSignedIn, isAuthLoading, userName, userId } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<DesignItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const isCreatingProjectRef = useRef(false);

  const firstName = userName?.split(" ")[0] || "there";
  const totalProjects = projects.length;
  const privateCount = projects.filter((p) => !p.isPublic).length;
  const publicCount = projects.filter((p) => Boolean(p.isPublic)).length;

  useEffect(() => {
    if (!isAuthLoading && !isSignedIn) {
      navigate("/");
    }
  }, [isAuthLoading, isSignedIn, navigate]);

  useEffect(() => {
    if (!isSignedIn) return;
    const fetchProjects = async () => {
      try {
        const items = await getProjects();
        setProjects(items);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProjects();
  }, [isSignedIn]);

  const handleUploadComplete = async (base64Image: string) => {
    try {
      if (isCreatingProjectRef.current) return false;
      isCreatingProjectRef.current = true;

      const validation = await validateServerUploadBoundary(base64Image);
      if (!validation.valid) return { success: false, error: validation.error };

      const newId = Date.now().toString();
      const name = `Residence ${newId}`;
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
        visibility: "private",
      });
      if (!saved) return false;

      setProjects((prev) => [saved, ...prev]);
      setShowModal(false);
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

  const handleToggleVisibility = async (
    e: React.MouseEvent,
    project: DesignItem,
  ) => {
    e.stopPropagation();
    try {
      setTogglingId(project.id);
      const nextIsPublic = !project.isPublic;
      const updated = await toggleProjectVisibility({
        project,
        isPublic: nextIsPublic,
      });
      if (updated) {
        setProjects((prev) =>
          prev.map((p) => (p.id === project.id ? updated : p)),
        );
      }
    } catch (error) {
      console.error("Failed to toggle visibility:", error);
    } finally {
      setTogglingId(null);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full bg-zinc-200 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      {/* Stats Row */}
      <div className="dash-header">
        <div className="dash-greeting">
          <h1>Hey, {firstName}!</h1>
          <p>Here's an overview of your workspace.</p>
        </div>
        <div className="dash-stats">
          <div className="stat-pill">
            <span className="stat-value">
              {isLoading ? "—" : totalProjects}
            </span>
            <span className="stat-label">Total</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-pill">
            <span className="stat-value">{isLoading ? "—" : privateCount}</span>
            <span className="stat-label">Private</span>
          </div>
          <div className="stat-divider" />
          <div className="stat-pill">
            <span className="stat-value">{isLoading ? "—" : publicCount}</span>
            <span className="stat-label">Public</span>
          </div>
        </div>
      </div>

      <hr className="dash-divider" />

      {/* Projects Section */}
      <div className="dash-body">
        <div className="dash-section-head">
          <h2>Your Projects</h2>
          <Button
            size="sm"
            className="new-project-btn cursor-pointer"
            onClick={() => setShowModal(true)}
          >
            <Plus className="w-4 h-4 mr-1.5" /> New Project
          </Button>
        </div>

        {isLoading ? (
          <div className="projects-grid">
            {[1, 2, 3].map((i) => (
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
            {projects.map((project) => {
              const {
                id,
                name,
                renderedImage,
                sourceImage,
                timestamp,
                isPublic,
              } = project;
              return (
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
                    <Toggle
                      checked={Boolean(isPublic)}
                      loading={togglingId === id}
                      onChange={(_, e) => handleToggleVisibility(e, project)}
                      className="absolute top-3 right-3 z-10"
                    />
                  </div>
                  <div className="card-body">
                    <div>
                      <h3>{name}</h3>
                      <div className="meta">
                        <Clock size={12} />
                        <span>{new Date(timestamp).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="arrow">
                      <ArrowRight size={20} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-projects-state">
            <div className="empty-icon-wrap">
              <FolderPlus className="empty-icon" size={26} />
            </div>
            <h3>No projects yet</h3>
            <p>
              Upload your first floor plan to start generating 3D architectural
              visualizations.
            </p>
            <button className="empty-cta" onClick={() => setShowModal(true)}>
              Upload Floor Plan <ArrowRight size={14} className="icon" />
            </button>
          </div>
        )}
      </div>

      {/* New Project Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="modal-label">New Project</p>
                <h3 className="modal-title">Upload a floor plan</h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="modal-close cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <Upload onComplete={handleUploadComplete} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
