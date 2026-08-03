import { CheckCircle2, ImageIcon, UploadIcon } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { useOutletContext } from "react-router";
import {
  ALLOWED_FILE_EXTENSIONS,
  ALLOWED_IMAGE_TYPES,
  MAX_FILE_SIZE_BYTES,
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
  const [error, setError] = useState<string | null>(null);

  const { isSignedIn } = useOutletContext<AuthContext>();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);
  const base64DataRef = useRef<string | null>(null);

  useEffect(() => {
    if (progress >= 100 && !completedRef.current) {
      completedRef.current = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      timeoutRef.current = setTimeout(() => {
        if (base64DataRef.current) {
          onComplete?.(base64DataRef.current);
        }
      }, REDIRECT_DELAY_MS);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [progress, onComplete]);

  const processFile = (selectedFile: File | null | undefined) => {
    if (!isSignedIn || !selectedFile) return;
    const isValidType =
      ALLOWED_IMAGE_TYPES.includes(selectedFile.type) ||
      ALLOWED_FILE_EXTENSIONS.some((ext) => selectedFile.name.toLowerCase().endsWith(ext));
    if (!isValidType) {
      setError("Unsupported file format. Please upload a JPG, PNG, WEBP, or SVG file.");
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setError("File size exceeds the 10MB limit. Please upload a smaller file.");
      return;
    }
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    completedRef.current = false;
    base64DataRef.current = null;
    setError(null);
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

      base64DataRef.current = base64Data;
      intervalRef.current = setInterval(() => {
        setProgress((prev) => (prev + PROGRESS_INCREMENT >= 100 ? 100 : prev + PROGRESS_INCREMENT));
      }, PROGRESS_INTERVAL_MS);
    };
    reader.onerror = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setFile(null);
      setProgress(0);
      setError("Failed to read the selected file. Please try uploading again.");
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
    if (droppedFile) {
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
            {error && <p className="text-red-500 text-xs font-semibold mt-2">{error}</p>}
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