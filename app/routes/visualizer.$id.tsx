import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import puter from "@heyputer/puter.js";
import { useAuth } from "../../components/AuthProvider";
import { generate3DView } from "../../lib/ai.action";
import Button from "../../components/ui/Button";
import { Check, Copy, Download, Globe, Loader2, Lock, RefreshCcw, Share2, X } from "lucide-react";
import { createProject, getProjectById, toggleProjectVisibility } from "../../lib/puter.action";
import {
  ReactCompareSlider,
  ReactCompareSliderImage,
} from "react-compare-slider";
import { fetchBlobFromUrl, getImageExtension } from "../../lib/utils";

export function meta() {
  return [
    { title: "Visualizer - Florepy" },
    { name: "description", content: "View and compare your architectural visualizations." }
  ];
}

function VisualizerId() {
  // which user which id
  const { id } = useParams();
  const { userId, userName } = useAuth();

  const navigate = useNavigate();

  const hasInitialGenerated = useRef(false);

  const [isProcessing, setIsProcessing] = useState(false);
  // came to this page after the generation or to generate
  // when coming to this page only get from BE
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [project, setProject] = useState<DesignItem | null>(null);
  const [isProjectLoading, setIsProjectLoading] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const isOwner =
    project?.isOwner !== undefined
      ? Boolean(project.isOwner)
      : Boolean(
          (userId && project?.ownerId && userId === project.ownerId) ||
          (userName &&
            project?.ownerName &&
            userName.toLowerCase() === project.ownerName.toLowerCase())
        );

  const handleBack = () => navigate("/");

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  const handleShareClick = () => {
    if (!isOwner) return;
    setShowShareModal(true);
  };

  const handleConfirmShare = async () => {
    if (!project || !isOwner) return;
    try {
      setIsSharing(true);
      const updated = await toggleProjectVisibility({
        project,
        isPublic: true,
      });
      if (updated) {
        setProject(updated);
      }
      await copyShareLink();
    } catch (err) {
      console.error("Failed to publish and share project:", err);
    } finally {
      setIsSharing(false);
    }
  };

  const handleMakePrivate = async () => {
    if (!project || !isOwner) return;
    try {
      setIsSharing(true);
      const updated = await toggleProjectVisibility({
        project,
        isPublic: false,
      });
      if (updated) {
        setProject(updated);
      }
    } catch (err) {
      console.error("Failed to unpublish project:", err);
    } finally {
      setIsSharing(false);
    }
  };

  const handleExport = async () => {
    if (!currentImage) return;

    try {
      let data = await fetchBlobFromUrl(currentImage);

      // Fallback: if fetch failed (e.g. Puter read token expired), read directly from puter.fs
      if (!data && id) {
        try {
          const candidatePaths = [
            `project/${id}/rendered.png`,
            `project/${id}/rendered.jpg`,
            `project/${id}/rendered.jpeg`,
            `project/${id}/source.png`,
            `project/${id}/source.jpg`,
            `project/${id}/source.jpeg`,
          ];
          for (const filePath of candidatePaths) {
            try {
              const blob = await puter.fs.read(filePath);
              if (blob && blob.size > 0) {
                data = { blob, contentType: blob.type || "image/png" };
                break;
              }
            } catch {
              // try next path
            }
          }
        } catch (fsErr) {
          console.warn("Direct Puter FS read fallback failed:", fsErr);
        }
      }

      if (!data) throw new Error("Failed to fetch image blob");

      const ext = getImageExtension(data.contentType, currentImage) || "png";
      const blobUrl = URL.createObjectURL(data.blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `florepy-${project?.name || `Residence-${id || "render"}`}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Failed to export image:", error);
    }
  };

  const runGeneration = async (item: DesignItem) => {
    if (!id || !item.sourceImage) return;

    try {
      setIsProcessing(true);

      const result = await generate3DView({ sourceImage: item.sourceImage });
      if (result.renderedImage) {
        setCurrentImage(result.renderedImage);

        // Preserve current visibility (public or private) instead of downgrading
        const currentVisibility = item.isPublic ? "public" : (item.visibility || "private");

        // put this image in the kv of the project which is already present
        const updatedItem: DesignItem = {
          ...item,
          renderedImage: result.renderedImage,
          renderedPath: result.renderedPath,
          timestamp: Date.now(),
          ownerId: item.ownerId ?? userId ?? null,
          ownerName: item.ownerName ?? userName ?? null,
          isPublic: currentVisibility === "public",
          visibility: currentVisibility,
        };

        const saved = await createProject({
          item: updatedItem,
          visibility: currentVisibility,
        });

        if (saved) {
          setProject(saved);
          setCurrentImage(saved.renderedImage || result.renderedImage);
        }
      }
    } catch (error) {
      console.error("Generation failed: ", error);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadProject = async () => {
      if (!id) {
        setIsProjectLoading(false);
        return;
      }

      setIsProjectLoading(true);

      const fetchedProject = await getProjectById({ id });

      if (!isMounted) return;

      setProject(fetchedProject);
      setCurrentImage(fetchedProject?.renderedImage || null);
      setIsProjectLoading(false);
      hasInitialGenerated.current = false;
    };

    loadProject();

    return () => {
      isMounted = false;
    };
  }, [id]);

  useEffect(() => {
    if (
      isProjectLoading ||
      hasInitialGenerated.current ||
      !project?.sourceImage
    )
      return;

    if (project.renderedImage) {
      setCurrentImage(project.renderedImage);
      hasInitialGenerated.current = true;
      return;
    }

    hasInitialGenerated.current = true;
    void runGeneration(project);
  }, [project, isProjectLoading]);

  return (
    <div className="visualizer">
      <section className="content">
        {isProjectLoading ? (
          <div className="panel animate-pulse">
            <div className="panel-header">
              <div className="panel-meta w-full max-w-[50%]">
                <div className="h-3 bg-zinc-200 rounded w-16 mb-4"></div>
                <div className="h-8 bg-zinc-200 rounded w-full mb-3"></div>
                <div className="h-3 bg-zinc-200 rounded w-24"></div>
              </div>
              <div className="panel-actions">
                <div className="h-9 bg-zinc-200 rounded w-24"></div>
                <div className="h-9 bg-zinc-200 rounded w-24"></div>
              </div>
            </div>
            <div className="render-area bg-zinc-200/50 min-h-[500px]"></div>
          </div>
        ) : (
          <div className="panel shadow-sm">
            <div className="panel-header">
              <div className="panel-meta">
                <p>Project</p>
                <h2>{project?.name || `Residence ${id}`}</h2>
                <p className="note">
                  Created by {isOwner ? "you" : (project?.ownerName || "Community Member")} &bull; Drag slider to compare
                </p>
              </div>
              <div className="panel-actions">
                <Button
                  size="sm"
                  onClick={handleExport}
                  className="export"
                  disabled={!currentImage}
                >
                  <Download className="w-4 h-4 mr-2" /> Export
                </Button>
                {isOwner ? (
                  <Button
                    size="sm"
                    onClick={handleShareClick}
                    className="share cursor-pointer"
                    disabled={!currentImage || isSharing}
                  >
                    <Share2 className="w-4 h-4 mr-2" /> Share
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={copyShareLink}
                    className="share cursor-pointer"
                    disabled={!currentImage}
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 mr-2 text-emerald-500" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" /> Copy Link
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
            <div className={`render-area ${isProcessing ? "is-processing" : ""} min-h-[500px]`}>
              {currentImage && project?.sourceImage && !isProcessing ? (
                <ReactCompareSlider
                  defaultValue={50}
                  style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
                  itemOne={
                    <ReactCompareSliderImage
                      src={project.sourceImage}
                      alt="before"
                      className="render-img w-full h-full"
                      style={{ objectFit: 'contain' }}
                    />
                  }
                  itemTwo={
                    <ReactCompareSliderImage
                      src={currentImage}
                      alt="after"
                      className="render-img w-full h-full"
                      style={{ objectFit: 'contain' }}
                    />
                  }
                />
              ) : currentImage ? (
                <img src={currentImage} alt="AI Render" className="render-img" />
              ) : (
                <div className="render-placeholder flex items-center justify-center w-full h-full absolute inset-0">
                  {project?.sourceImage && (
                    <img
                      src={project.sourceImage}
                      alt="Original"
                      className="render-fallback object-contain w-full h-full max-h-[80vh]"
                    />
                  )}
                </div>
              )}

              {isProcessing && (
                <div className="render-overlay absolute inset-0 z-50 flex items-center justify-center bg-zinc-100/80 backdrop-blur-sm">
                  <div className="rendering-card bg-white p-6 rounded-2xl shadow-sm flex flex-col items-center">
                    <RefreshCcw className="spinner animate-spin text-primary w-8 h-8 mb-4" />
                    <span className="title font-bold text-lg mb-1">Rendering...</span>
                    <span className="subtitle text-sm text-zinc-500">
                      Generating your 3D visualization...
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Ultra-Compact Share Modal */}
      {showShareModal && isOwner && (
        <div className="modal-overlay" onClick={() => !isSharing && setShowShareModal(false)}>
          <div className="bg-white rounded-xl border border-zinc-200/90 max-w-[360px] w-full p-4 shadow-xl relative" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
               
                <h3 className="text-sm font-semibold text-zinc-900">Share Project</h3>
              </div>
              <button
                onClick={() => !isSharing && setShowShareModal(false)}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isSharing}
              >
                <X size={15} />
              </button>
            </div>

            <div>
              {project?.isPublic ? (
                <div className="space-y-3">
                  <p className="text-xs text-zinc-500 leading-normal">
                    Anyone with this link can view the visualization.
                  </p>

                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={typeof window !== "undefined" ? window.location.href : ""}
                      className="w-full text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-md px-2.5 py-1.5 text-zinc-700 select-all outline-none truncate"
                    />
                    <button
                      type="button"
                      onClick={copyShareLink}
                      className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-900 text-white hover:bg-black transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                    >
                      {copied ? (
                        <>
                          <Check size={12} className="text-emerald-400" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy size={12} /> Copy
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-[11px] text-zinc-400">
                    <span className="flex items-center gap-1.5 text-zinc-500 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Public to anyone
                    </span>
                    <button
                      type="button"
                      onClick={handleMakePrivate}
                      disabled={isSharing}
                      className="hover:text-red-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Make Private
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-zinc-50 border border-zinc-200/80 rounded-lg p-2.5 flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-md bg-zinc-200/70 text-zinc-600 flex items-center justify-center shrink-0 mt-0.5">
                      <Lock size={13} />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-900">Private Project</h4>
                      <p className="text-[11px] text-zinc-500 leading-snug mt-0.5">
                        Only you can view this visualization. Publish it to generate a public share link.
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end items-center pt-1">
                    <button
                      type="button"
                      onClick={handleConfirmShare}
                      disabled={isSharing}
                      className="text-xs font-medium text-white bg-zinc-900 hover:bg-black px-3 py-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm"
                    >
                      {isSharing ? (
                        <>
                          <Loader2 size={12} className="animate-spin" /> Publishing...
                        </>
                      ) : (
                        <>
                          <Globe size={12} /> Publish &amp; Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default VisualizerId;
