import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowRight, Check, Clock, Copy, FolderPlus, Loader2, Plus, Trash2, X } from "lucide-react";
import Button from "../../components/ui/Button";
import Toggle from "../../components/ui/Toggle";
import Modal from "../../components/ui/Modal";
import ProjectSkeleton from "../../components/ui/ProjectSkeleton";
import Upload from "../../components/Upload";
import { useAuth } from "../../components/AuthProvider";
import {
  getProjects,
  createProject,
  toggleProjectVisibility,
  deleteProject,
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
  const [projectToDelete, setProjectToDelete] = useState<DesignItem | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [copiedName, setCopiedName] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isCreatingProjectRef = useRef(false);

  const targetDeleteName = projectToDelete?.name || (projectToDelete?.id ? `Residence ${projectToDelete.id}` : "");
  const isDeleteNameMatching = deleteConfirmText.trim() === targetDeleteName.trim() && targetDeleteName.length > 0;

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setProjectToDelete(null);
    setDeleteConfirmText("");
    setCopiedName(false);
  };

  const handleCopyProjectName = async () => {
    if (!targetDeleteName) return;
    try {
      await navigator.clipboard.writeText(targetDeleteName);
      setCopiedName(true);
      setTimeout(() => setCopiedName(false), 2000);
    } catch (err) {
      console.error("Failed to copy project name:", err);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!projectToDelete?.id || !isDeleteNameMatching) return;
    try {
      setIsDeleting(true);
      const success = await deleteProject({
        id: projectToDelete.id,
        isPublic: Boolean(projectToDelete.isPublic),
      });
      if (success) {
        setProjects((prev) => prev.filter((p) => p.id !== projectToDelete.id));
        closeDeleteModal();
      }
    } catch (err) {
      console.error("Failed to delete project:", err);
    } finally {
      setIsDeleting(false);
    }
  };

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
          <ProjectSkeleton count={3} />
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
                      className="absolute top-3 left-3 z-10"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmText("");
                        setCopiedName(false);
                        setProjectToDelete(project);
                      }}
                      className="absolute top-3 right-3 z-10 w-7 h-7 rounded-md bg-white/90 hover:bg-white text-zinc-400 hover:text-red-600 flex items-center justify-center transition-all shadow-sm cursor-pointer"
                      title="Delete project"
                    >
                      <Trash2 size={13} />
                    </button>
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
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Upload a floor plan"
        description="New Project"
        maxWidth="lg"
      >
        <div className="pt-1">
          <Upload onComplete={handleUploadComplete} />
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(projectToDelete)}
        onClose={closeDeleteModal}
        disabled={isDeleting}
        maxWidth="sm"
        showCloseButton={!isDeleting}
        title="Delete Project"
      >
        <p className="text-xs text-zinc-500 leading-relaxed mb-3">
          This action cannot be undone. This will permanently delete the visualization and floor plan.
        </p>

        {/* Confirmation text input with inline project name & copy button */}
        <div className="mb-4">
          <p className="text-xs text-zinc-600 mb-2 leading-relaxed">
            Type <strong className="font-semibold text-zinc-900">{targetDeleteName}</strong>{" "}
            <button
              type="button"
              onClick={handleCopyProjectName}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-900 px-1.5 py-0.5 rounded hover:bg-zinc-100 border border-zinc-200 transition-colors cursor-pointer align-middle mx-1"
              title="Copy project name"
            >
              {copiedName ? (
                  <Check size={11} className="text-emerald-500" />
              ) : (
                  <Copy size={11} />
              )}
            </button>{" "}
            to confirm:
          </p>
          <input
            type="text"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder={targetDeleteName}
            disabled={isDeleting}
            autoFocus
            className="w-full text-xs bg-white border border-zinc-200 focus:border-red-500 focus:ring-1 focus:ring-red-500 rounded-md px-2.5 py-2 text-zinc-900 outline-none transition-colors"
          />
        </div>

        {/* Modal actions */}
        <div className="flex items-center justify-end pt-2 border-t border-zinc-100">
          <button
            type="button"
            disabled={isDeleting || !isDeleteNameMatching}
            onClick={handleDeleteConfirm}
            className="px-3.5 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {isDeleting ? (
              <>
                <Loader2 size={12} className="animate-spin" /> Deleting...
              </>
            ) : (
              "Delete Project"
            )}
          </button>
        </div>
      </Modal>
    </div>
  );
}
