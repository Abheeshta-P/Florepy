import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router"; import { useAuth } from "../../components/AuthProvider";
import { generate3DView } from "../../lib/ai.action";
import Button from "../../components/ui/Button";
import { Download, RefreshCcw, Share2, X } from "lucide-react";
import { createProject, getProjectById } from "../../lib/puter.action";
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
  const { userId } = useAuth();

  const navigate = useNavigate();

  const hasInitialGenerated = useRef(false);

  const [isProcessing, setIsProcessing] = useState(false);
  // came to this page after the generation or to generate
  // when coming to this page only get from BE
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [project, setProject] = useState<DesignItem | null>(null);
  const [isProjectLoading, setIsProjectLoading] = useState(true);

  const handleBack = () => navigate("/");

  const handleExport = async () => {
    if (!currentImage) return;

    try {
      const data = await fetchBlobFromUrl(currentImage);
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
      const link = document.createElement("a");
      link.href = currentImage;
      link.download = `${project?.name || `Residence-${id || "render"}`}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const runGeneration = async (item: DesignItem) => {
    if (!id || !item.sourceImage) return;

    try {
      setIsProcessing(true);

      const result = await generate3DView({ sourceImage: item.sourceImage });
      if (result.renderedImage) {
        setCurrentImage(result.renderedImage);

        // put this image in the kv of the project which is already present
        const updatedItem: DesignItem = {
          ...item,
          renderedImage: result.renderedImage,
          renderedPath: result.renderedPath,
          timestamp: Date.now(),
          ownerId: item.ownerId ?? userId ?? null,
          isPublic: item.isPublic ?? false,
        };

        const saved = await createProject({
          item: updatedItem,
          visibility: "private",
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
      <nav className="topbar">
        <div className="brand">
          <img src="/florepy.png" alt="Logo" width={35} height={35} />
          <span className="name">Florepy</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleBack} className="exit">
          <X className="icon" /> Exit Editor
        </Button>
      </nav>

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
                <p className="note">Created by you &bull; Drag slider to compare</p>
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
                <Button
                  size="sm"
                  onClick={() => {}}
                  className="share"
                  disabled={!currentImage}
                >
                  <Share2 className="w-4 h-4 mr-2" /> Share
                </Button>
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
    </div>
  );
}

export default VisualizerId;
