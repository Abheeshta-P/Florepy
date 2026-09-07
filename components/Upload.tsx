import { CheckCircle2, ImageIcon, UploadIcon, Loader2 } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthProvider";
import {
  ALLOWED_FILE_EXTENSIONS,
  ALLOWED_IMAGE_TYPES,
  MAX_FILE_SIZE_BYTES,
  PROGRESS_INCREMENT,
  PROGRESS_INTERVAL_MS,
  REDIRECT_DELAY_MS,
} from "../lib/constants";

interface UploadProps {
  onComplete?: (
    base64Data: string
  ) => Promise<{ success: boolean; error?: string } | boolean | void> | void;
}

import { imageUrlToPngBlob } from "../lib/utils";

const Upload: React.FC<UploadProps> = ({ onComplete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);

  const { isSignedIn } = useAuth();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const base64DataRef = useRef<string | null>(null);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (progress >= 100) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      const timeoutId = setTimeout(async () => {
        if (base64DataRef.current && onCompleteRef.current) {
          setIsProcessing(true);
          try {
            const result = await onCompleteRef.current(base64DataRef.current);
            if (result === false || (result && typeof result === "object" && !result.success)) {
              setFile(null);
              setProgress(0);
              setIsProcessing(false);
              const errMsg = (result && typeof result === "object" && result.error) 
                ? result.error 
                : "Server validation failed or project creation failed. Please try uploading again.";
              setError(errMsg);
            }
          } catch (err: any) {
            setFile(null);
            setProgress(0);
            setIsProcessing(false);
            setError("An error occurred during upload validation.");
          }
        }
      }, REDIRECT_DELAY_MS);
      timeoutRef.current = timeoutId;
      
      return () => clearTimeout(timeoutId);
    }
  }, [progress]);

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
    base64DataRef.current = null;
    setError(null);
    setFile(selectedFile);
    setProgress(0);
    setIsProcessing(false);

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
          const blob = await imageUrlToPngBlob(base64Data);
          if (!blob) throw new Error("Conversion returned null");
          base64Data = await new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result as string);
            fr.onerror = reject;
            fr.readAsDataURL(blob);
          });
        } catch (err) {
          console.error("Failed to rasterize SVG for AI processing:", err);
          setFile(null);
          setProgress(0);
          setError("Failed to process SVG file. Please upload a valid vector floor plan.");
          return;
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
                {isProcessing ? (
                  <Loader2 className="animate-spin text-primary w-6 h-6" />
                ) : progress === 100 ? (
                  <CheckCircle2 className="check"/>
                ) : (
                  <ImageIcon className="image"/>
                )}
              </div>
              <h3>{file.name}</h3>
              <div className="progress">
                <div className="bar" style={{ width: `${progress}%` }} />
                
                <p className="status-text">
                  {isProcessing ? "Processing..." : progress < 100 ? "Analyzing Floor Plan..." : "Redirecting..."}
                </p>
              </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Upload;
