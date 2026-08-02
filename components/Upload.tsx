import { CheckCircle2, ImageIcon, UploadIcon } from "lucide-react";
import React, { useState } from "react";
import { useOutletContext } from "react-router";
import {
  PROGRESS_INCREMENT,
  PROGRESS_INTERVAL_MS,
  REDIRECT_DELAY_MS,
} from "../lib/constants";

interface UploadProps {
  onComplete?: (base64Data: string) => void;
}

const convertSvgToPng = (svgDataUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // Provide high-definition fallback sizing if intrinsic coordinates are missing
      const width = img.width || 1024;
      const height = img.height || 1024;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2d context not available"));
        return;
      }
      // Fill a crisp white backdrop so transparent SVG floor plans do not turn black when processed by AI models
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = (err) => reject(err);
    img.src = svgDataUrl;
  });
};

const Upload: React.FC<UploadProps> = ({ onComplete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);

  const { isSignedIn } = useOutletContext<AuthContext>();

  const processFile = (selectedFile: File | null | undefined) => {
    if (!isSignedIn || !selectedFile) return;
    setFile(selectedFile);
    setProgress(0);

    const reader = new FileReader();
    reader.onloadend = async () => {
      let base64Data = reader.result as string;
      if (!base64Data) return;

      // Automatically rasterize vector SVGs into PNG Data URLs for AI model compatibility
      if (
        selectedFile.type === "image/svg+xml" ||
        selectedFile.name.toLowerCase().endsWith(".svg")
      ) {
        try {
          base64Data = await convertSvgToPng(base64Data);
        } catch (err) {
          console.error("Failed to rasterize SVG for AI processing:", err);
        }
      }

      const interval = setInterval(() => {
        setProgress((prev) => {
          const next = prev + PROGRESS_INCREMENT;
          if (next >= 100) {
            clearInterval(interval);
            setTimeout(() => {
              onComplete?.(base64Data);
            }, REDIRECT_DELAY_MS);
            return 100;
          }
          return next;
        });
      }, PROGRESS_INTERVAL_MS);
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isSignedIn) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!isSignedIn) return;

    const droppedFile = e.dataTransfer.files?.[0];
    if (
      droppedFile &&
      (droppedFile.type.startsWith('image/') ||
        droppedFile.name.toLowerCase().endsWith('.svg'))
    ) {
      processFile(droppedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isSignedIn) return;
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  return (
    <div className='upload'>
      {!file ? (
        <div
          className={`dropzone ${isDragging ? 'is-dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            className="drop-input"
            disabled={!isSignedIn}
            accept=".jpg,.jpeg,.png,.webp,.svg,image/svg+xml"
            onChange={handleFileChange}
          />
          <div className="drop-content">
            <div className="drop-icon">
              <UploadIcon size={20}/>
            </div>
            <p>
              {isSignedIn ? ("Click to upload or just drag and drop") : ("Signin or Signup with puter to upload")}
            </p>
            <p className="help">Supports JPG, PNG & SVG up to 10MB.</p>
          </div>
        </div>) : (
          <div className="upload-status">
            <div className="status-content">
              <div className="status-icon">
                {progress === 100 ? (<CheckCircle2 className="check"/>) : (<ImageIcon className="image"/>)}
              </div>
              <h3>{file.name}</h3>
              <div className="progress">
                <div className="bar" style={{ width: `${progress}%` }} />
                
                <p className="status-text">
                  {progress < 100 ? "Analyzing Floor Plan..." : "Redirecting..."}
                </p>
              </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Upload;