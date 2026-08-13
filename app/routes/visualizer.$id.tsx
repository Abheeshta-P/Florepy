import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { generate3DView } from "../../lib/ai.action";
import Button from "../../components/ui/Button";
import { Download, RefreshCcw, Share2, X } from "lucide-react";

function VisualizerId() {
  const navigate = useNavigate();
  const location = useLocation();
  const { intialImage, name, intialRendered } = location.state || {};

  const hasInitialGenerated = useRef(false);

  const [isProcessing, setIsProcessing] = useState(false);
  // came to this page after the generation or to generate
  const [currentImage, setCurrentImage] = useState<string | null>(
    intialRendered || null,
  );

  const handleBack = () => navigate("/");

  const runGeneration = async () => {
    if (!intialImage) return;

    try {
      setIsProcessing(true);

      const result = await generate3DView({ sourceImage: intialImage });
      if (result.renderedImage) {
        setCurrentImage(result.renderedImage);

        // put this image in the kv of the project
      }
    } catch (error) {
      console.error("Generation failed: ", error);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    // if doesnt has source image or the ai image is already generated
    if (!intialImage || hasInitialGenerated.current) return;

    if (intialRendered) {
      // ai image is already there
      setCurrentImage(intialRendered);
      hasInitialGenerated.current = true;
      return;
    }

    // generete image
    runGeneration();
    hasInitialGenerated.current = true;
  }, [intialImage, intialRendered]);

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
        <div className="panel">
          <div className="panel-header">
            <div className="panel-meta">
              <p>Project</p>
              <h2>{"Untitled project"}</h2>
              <p className="note">Created by you</p>
            </div>
            <div className="panel-actions">
              <Button
                size="sm"
                onClick={() => {}}
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
          <div className={`render-area ${isProcessing ? "is-processing" : ""}`}>
            {currentImage ? (
              <img src={currentImage} alt="AI Render" className="render-img" />
            ) : (
              <div className="render-placeholder">
                {intialImage && (
                  <img
                    src={intialImage}
                    alt="Original"
                    className="render-fallback"
                  />
                )}
              </div>
            )}

            {isProcessing && (
              <div className="render-overlay">
                <div className="rendering-card">
                  <RefreshCcw className="spinner" />
                  <span className="title">Rendering...</span>
                  <span className="subtitle">
                    Generating your 3D visualization...
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
      {intialImage && (
        <div className="image-container">
          <h2>Source Image</h2>
          <img src={intialImage} alt="source" />
        </div>
      )}
    </div>
  );
}

export default VisualizerId;
