import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import puter from "@heyputer/puter.js";
import { useAuth } from "../../components/AuthProvider";
import { generate3DView } from "../../lib/ai.action";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import ProjectNotFound from "../../components/ProjectNotFound";
import {
  Check,
  ChevronDown,
  Clock,
  Copy,
  Download,
  FileDown,
  FileImage,
  GitBranch,
  Globe,
  Loader2,
  Lock,
  MessageSquare,
  Pencil,
  RefreshCcw,
  Share2,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  createProject,
  createProjectRevision,
  ensureHostedReviewImages,
  getProjectById,
  resolveDisplayUrl,
  switchProjectVersion,
  toggleProjectPublic,
  updateProjectReviews,
  updateProjectVersionSettings,
} from "../../lib/puter.action";
import {
  ALLOWED_FILE_EXTENSIONS,
  ALLOWED_IMAGE_TYPES,
  MAX_FILE_SIZE_BYTES,
} from "../../lib/constants";
import {
  ReactCompareSlider,
  ReactCompareSliderImage,
} from "react-compare-slider";
import {
  fetchBlobFromUrl,
  getImageExtension,
  isDisplayableUrl,
  copyTextToClipboard,
} from "../../lib/utils";

export function meta() {
  return [
    { title: "Visualizer - Florepy" },
    {
      name: "description",
      content: "View and compare your architectural visualizations.",
    },
  ];
}

function VisualizerId() {
  // which user which id
  const { id } = useParams();
  const { userId, userName, isSignedIn } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const reviewTokenFromUrl = searchParams.get("review");

  const hasInitialGenerated = useRef(false);

  const [isProcessing, setIsProcessing] = useState(false);
  // came to this page after the generation or to generate
  // when coming to this page only get from BE
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [project, setProject] = useState<DesignItem | null>(null);
  const [isProjectLoading, setIsProjectLoading] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTab, setShareTab] = useState<"review" | "public">("review");
  const [isSharing, setIsSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedReview, setCopiedReview] = useState(false);
  const [enablePasscode, setEnablePasscode] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState("");
  const [isSavingPasscode, setIsSavingPasscode] = useState(false);
  const [passcodeToast, setPasscodeToast] = useState<string | null>(null);

  // Versioning & revision states
  const [showVersionDropdown, setShowVersionDropdown] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [showNewRevisionModal, setShowNewRevisionModal] = useState(false);
  const [revisionName, setRevisionName] = useState("");
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [revisionFileBase64, setRevisionFileBase64] = useState<string | null>(null);
  const [isCreatingRevision, setIsCreatingRevision] = useState(false);
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const [allowClientVersions, setAllowClientVersions] = useState(false);
  const [isSavingVersionSettings, setIsSavingVersionSettings] = useState(false);
  const [isResolvingAll, setIsResolvingAll] = useState(false);

  // Review interaction states
  const [isReviewLocked, setIsReviewLocked] = useState(false);
  const [enteredPasscode, setEnteredPasscode] = useState("");
  const [passcodeError, setPasscodeError] = useState(false);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [isPlacingReview, setIsPlacingReview] = useState(false);
  const [pendingReviewPin, setPendingReviewPin] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [reviewerName, setReviewerName] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("florepy_reviewer_name") || "";
    }
    return "";
  });
  const [reviewText, setReviewText] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewLockedView, setReviewLockedView] = useState<"3d" | "plan">("3d");
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [editingReviewText, setEditingReviewText] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [myReviewIds, setMyReviewIds] = useState<string[]>(() => {
    if (typeof window !== "undefined" && id) {
      try {
        const stored = localStorage.getItem(`florepy_my_reviews_${id}`);
        return stored ? JSON.parse(stored) : [];
      } catch {}
    }
    return [];
  });

  const isAddingComment = Boolean(isPlacingReview || pendingReviewPin);

  useEffect(() => {
    if (isSignedIn && userName) {
      setReviewerName(userName);
    }
  }, [isSignedIn, userName]);

  useEffect(() => {
    setIsImageLoaded(false);
  }, [currentImage]);

  const renderAreaRef = useRef<HTMLDivElement>(null);
  const [imageNaturalSize, setImageNaturalSize] = useState<{
    width: number;
    height: number;
  }>({
    width: 1024,
    height: 1024,
  });
  const [imageBounds, setImageBounds] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });

  const activeImageUrl =
    reviewLockedView === "plan" && project?.sourceImage
      ? project.sourceImage
      : currentImage;

  useEffect(() => {
    if (!activeImageUrl || typeof window === "undefined") return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) {
        setImageNaturalSize({
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      }
    };
    img.src = activeImageUrl;
  }, [activeImageUrl]);

  const updateImageBounds = useCallback(() => {
    if (!renderAreaRef.current) return;
    const rect = renderAreaRef.current.getBoundingClientRect();
    const cW = rect.width;
    const cH = rect.height;
    if (!cW || !cH) return;

    const naturalW = imageNaturalSize.width || 1024;
    const naturalH = imageNaturalSize.height || 1024;
    const imgAspect = naturalW / naturalH;
    const containerAspect = cW / cH;

    let renderedW = cW;
    let renderedH = cH;
    let left = 0;
    let top = 0;

    if (containerAspect > imgAspect) {
      // Container is wider than the image -> letterbox on left and right
      renderedH = cH;
      renderedW = cH * imgAspect;
      left = (cW - renderedW) / 2;
      top = 0;
    } else {
      // Container is taller than the image -> letterbox on top and bottom
      renderedW = cW;
      renderedH = cW / imgAspect;
      left = 0;
      top = (cH - renderedH) / 2;
    }

    setImageBounds({
      left: Math.round(left * 10) / 10,
      top: Math.round(top * 10) / 10,
      width: Math.round(renderedW * 10) / 10,
      height: Math.round(renderedH * 10) / 10,
    });
  }, [imageNaturalSize]);

  useEffect(() => {
    updateImageBounds();
    if (typeof window === "undefined" || !renderAreaRef.current) return;

    const observer = new ResizeObserver(() => {
      updateImageBounds();
    });

    observer.observe(renderAreaRef.current);
    window.addEventListener("resize", updateImageBounds);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateImageBounds);
    };
  }, [updateImageBounds]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setIsImageLoaded(true);
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setImageNaturalSize({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    }
  };

  const isOwner =
    project?.isOwner !== undefined
      ? Boolean(project.isOwner)
      : Boolean(
          (userId && project?.ownerId && userId === project.ownerId) ||
          (userName &&
            project?.ownerName &&
            userName.toLowerCase() === project.ownerName.toLowerCase()),
        );

  const isClientReviewMode = Boolean(
    !isOwner &&
      reviewTokenFromUrl &&
      project?.reviewToken &&
      reviewTokenFromUrl === project.reviewToken,
  );

  const currentActiveVer =
    project?.versions?.find((v) => v.id === project?.activeVersionId) ||
    project?.versions?.[0] ||
    null;
  const activeVersionReviews =
    currentActiveVer?.reviews || project?.reviews || [];
  const unresolvedReviews = activeVersionReviews.filter((r) => !r.resolved);
  const hasUnresolvedReviews = unresolvedReviews.length > 0;

  // Review permissions:
  // "Add Review" is strictly for clients viewing the shared review link.
  // The owner is the creator/builder and views/resolves reviews, without adding reviews to their own project.
  const canAddReview = isClientReviewMode;

  // Reviews pins are ONLY visible once the picture is fully loaded, not locked, and not processing
  const areReviewsVisible = Boolean(
    isImageLoaded && !isReviewLocked && !isProjectLoading && !isProcessing,
  );

  const copyShareLink = async () => {
    try {
      const publicUrl = `${window.location.origin}/visualizer/${id}`;
      const success = await copyTextToClipboard(publicUrl);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  const getClientReviewUrl = () => {
    if (!id || !project?.reviewToken) return "";
    return `${window.location.origin}/visualizer/${id}?review=${project.reviewToken}`;
  };

  const copyClientReviewLink = async () => {
    try {
      let token = project?.reviewToken;
      if (!token && isOwner && project?.id) {
        token = `rev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
        setProject((prev) => (prev ? { ...prev, reviewToken: token } : prev));
      }

      const reviewUrl = `${window.location.origin}/visualizer/${id}?review=${token || ""}`;

      // Copy immediately while user interaction gesture is active
      const copiedOk = await copyTextToClipboard(reviewUrl);
      if (copiedOk) {
        setCopiedReview(true);
        setTimeout(() => setCopiedReview(false), 2500);
      }

      // Sync hosted images and token in background if needed without delaying clipboard
      if (project?.id) {
        void ensureHostedReviewImages(project)
          .then((hosted) =>
            updateProjectReviews({
              projectId: project.id,
              reviewToken: token,
              reviewPasscode: project.reviewPasscode,
              reviews: project.reviews || [],
              sourceImage: hosted.sourceImage,
              renderedImage: hosted.renderedImage,
              action: "sync",
            }),
          )
          .catch((syncErr) => {
            console.warn("Background review sync after copy:", syncErr);
          });
      }
    } catch (err) {
      console.error("Failed to copy client review link:", err);
    }
  };

  const handleShareClick = () => {
    if (!isOwner) return;

    let token = project?.reviewToken;
    if (!token && project?.id) {
      token = `rev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
      setProject((prev) => (prev ? { ...prev, reviewToken: token } : prev));
    }

    setEnablePasscode(Boolean(project?.reviewPasscode));
    setPasscodeInput(project?.reviewPasscode || "");
    setAllowClientVersions(Boolean(project?.clientCanViewVersions));
    setPasscodeToast(null);
    setShowShareModal(true);

    // Sync hosted review images and worker index in background without lagging the UI
    if (project?.id) {
      void (async () => {
        try {
          const hosted = await ensureHostedReviewImages(project);
          await updateProjectReviews({
            projectId: project.id,
            reviewToken: token,
            reviewPasscode: project.reviewPasscode,
            reviews: project.reviews || [],
            sourceImage: hosted.sourceImage,
            renderedImage: hosted.renderedImage,
            action: "sync",
          });
          if (hosted.sourceImage || hosted.renderedImage) {
            setProject((prev) =>
              prev
                ? {
                    ...prev,
                    reviewToken: token,
                    sourceImage: hosted.sourceImage || prev.sourceImage,
                    renderedImage: hosted.renderedImage || prev.renderedImage,
                  }
                : prev,
            );
          }
        } catch (err) {
          console.warn("Background share sync failed:", err);
        }
      })();
    }
  };

  const handleToggleClientVersions = async (checked: boolean) => {
    setAllowClientVersions(checked);
    if (!project?.id || !isOwner) return;
    try {
      setIsSavingVersionSettings(true);
      await updateProjectVersionSettings({
        projectId: project.id,
        clientCanViewVersions: checked,
      });
      setProject((prev) =>
        prev ? { ...prev, clientCanViewVersions: checked } : prev,
      );
    } catch (err) {
      console.error("Failed to update version visibility settings:", err);
    } finally {
      setIsSavingVersionSettings(false);
    }
  };

  const handleTogglePasscode = async (checked: boolean) => {
    setEnablePasscode(checked);
    setPasscodeToast(null);

    if (!checked) {
      setPasscodeInput("");
      if (!project?.id || !isOwner) return;
      try {
        setIsSavingPasscode(true);
        setProject((prev) => (prev ? { ...prev, reviewPasscode: null } : prev));
        await updateProjectReviews({
          projectId: project.id,
          reviewToken: project.reviewToken,
          reviewPasscode: null,
          reviews: project.reviews || [],
          action: "sync",
        });
        setPasscodeToast("Passcode removed");
        setTimeout(() => setPasscodeToast(null), 2200);
      } catch (err) {
        console.error("Failed to clear passcode:", err);
      } finally {
        setIsSavingPasscode(false);
      }
    } else {
      setPasscodeInput(project?.reviewPasscode || "");
    }
  };

  const handleSavePasscode = async () => {
    if (!project?.id || !isOwner || !passcodeInput.trim()) return;
    try {
      setIsSavingPasscode(true);
      const newPasscode = passcodeInput.trim();
      await updateProjectReviews({
        projectId: project.id,
        reviewToken: project.reviewToken,
        reviewPasscode: newPasscode,
        reviews: project.reviews || [],
        action: "sync",
      });
      setProject((prev) =>
        prev ? { ...prev, reviewPasscode: newPasscode } : prev,
      );
      setPasscodeToast("Passcode saved!");
      setTimeout(() => setPasscodeToast(null), 2200);
    } finally {
      setIsSavingPasscode(false);
    }
  };

  const handleConfirmShare = async () => {
    if (!project || !isOwner) return;
    try {
      setIsSharing(true);
      const updated = await toggleProjectPublic({
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
      const updated = await toggleProjectPublic({
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

  const handleUnlockPasscode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!project?.reviewPasscode) return;
    if (enteredPasscode.trim() === project.reviewPasscode.trim()) {
      setIsReviewLocked(false);
      setPasscodeError(false);
      sessionStorage.setItem(`florepy_unlocked_${id}`, "true");
    } else {
      setPasscodeError(true);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (
      !canAddReview ||
      !isPlacingReview ||
      !areReviewsVisible ||
      !renderAreaRef.current
    )
      return;
    const rect = renderAreaRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const bounds =
      imageBounds.width > 0
        ? imageBounds
        : { left: 0, top: 0, width: rect.width, height: rect.height };

    // Ignore clicks outside the actual image (in empty letterbox margins)
    if (
      clickX < bounds.left ||
      clickX > bounds.left + bounds.width ||
      clickY < bounds.top ||
      clickY > bounds.top + bounds.height
    ) {
      return;
    }

    const x = Math.max(
      0,
      Math.min(
        100,
        Math.round(((clickX - bounds.left) / bounds.width) * 1000) / 10,
      ),
    );
    const y = Math.max(
      0,
      Math.min(
        100,
        Math.round(((clickY - bounds.top) / bounds.height) * 1000) / 10,
      ),
    );

    setPendingReviewPin({ x, y });
    setIsPlacingReview(false);
  };

  // Owner cannot edit comments at all; only the author who created it can edit
  const canEditReview = (rev: ProjectReview) => {
    if (isOwner) return false;
    if (myReviewIds.includes(rev.id)) return true;
    const currentAuthorName = (isSignedIn && userName ? userName : reviewerName)
      .trim()
      .toLowerCase();
    if (currentAuthorName && rev.author.toLowerCase() === currentAuthorName)
      return true;
    return false;
  };

  // Owner can delete ONLY if the review is resolved; client author can delete their own review
  const canDeleteReview = (rev: ProjectReview) => {
    if (isOwner) {
      return Boolean(rev.resolved);
    }
    if (myReviewIds.includes(rev.id)) return true;
    const currentAuthorName = (isSignedIn && userName ? userName : reviewerName)
      .trim()
      .toLowerCase();
    if (currentAuthorName && rev.author.toLowerCase() === currentAuthorName)
      return true;
    return false;
  };

  const handleAddReview = async () => {
    const author = (isSignedIn && userName ? userName : reviewerName).trim();
    if (!project?.id || !pendingReviewPin || !reviewText.trim() || !author)
      return;

    try {
      setIsSubmittingReview(true);
      const newReview: ProjectReview = {
        id: `rev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        x: pendingReviewPin.x,
        y: pendingReviewPin.y,
        author,
        text: reviewText.trim(),
        createdAt: Date.now(),
        resolved: false,
      };

      const updatedReviews = [...(project.reviews || []), newReview];
      const updatedVersions = (project.versions || []).map((ver) => {
        if (ver.id === (project.activeVersionId || ver.id)) {
          return { ...ver, reviews: [...(ver.reviews || []), newReview] };
        }
        return ver;
      });

      if (typeof window !== "undefined") {
        localStorage.setItem("florepy_reviewer_name", author);
        try {
          const updatedMyIds = [...myReviewIds, newReview.id];
          setMyReviewIds(updatedMyIds);
          localStorage.setItem(
            `florepy_my_reviews_${project.id}`,
            JSON.stringify(updatedMyIds),
          );
        } catch {}
      }

      setProject((prev) =>
        prev
          ? {
              ...prev,
              reviews: updatedReviews,
              versions: updatedVersions.length > 0 ? updatedVersions : prev.versions,
            }
          : prev,
      );
      setPendingReviewPin(null);
      setReviewText("");

      // Keep multi-review mode active so client can place next pin immediately!
      setIsPlacingReview(true);

      await updateProjectReviews({
        projectId: project.id,
        reviewToken: reviewTokenFromUrl || project.reviewToken,
        review: newReview,
        versionId: project.activeVersionId || undefined,
        action: "add",
      });
    } catch (err) {
      console.error("Failed to add review pin:", err);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleToggleResolveReview = async (reviewId: string) => {
    if (!project?.id || !isOwner) return;

    const targetReview = (project.reviews || []).find((r) => r.id === reviewId);
    const newResolved = !targetReview?.resolved;

    const updatedReviews = (project.reviews || []).map((r) =>
      r.id === reviewId ? { ...r, resolved: newResolved } : r,
    );
    const updatedVersions = (project.versions || []).map((ver) => {
      if (ver.id === (project.activeVersionId || ver.id)) {
        return {
          ...ver,
          reviews: (ver.reviews || []).map((r) =>
            r.id === reviewId ? { ...r, resolved: newResolved } : r,
          ),
        };
      }
      return ver;
    });

    setProject((prev) =>
      prev
        ? {
            ...prev,
            reviews: updatedReviews,
            versions: updatedVersions.length > 0 ? updatedVersions : prev.versions,
          }
        : prev,
    );

    await updateProjectReviews({
      projectId: project.id,
      reviewToken: project.reviewToken,
      reviewId,
      resolved: newResolved,
      versionId: project.activeVersionId || undefined,
      action: "resolve",
    });
  };

  const handleResolveAllReviews = async () => {
    if (!project?.id || !isOwner || isResolvingAll) return;
    try {
      setIsResolvingAll(true);
      const updatedReviews = activeVersionReviews.map((r) => ({
        ...r,
        resolved: true,
      }));
      const updatedVersions = (project.versions || []).map((ver) => {
        if (ver.id === (project.activeVersionId || ver.id)) {
          return {
            ...ver,
            reviews: (ver.reviews || []).map((r) => ({
              ...r,
              resolved: true,
            })),
          };
        }
        return ver;
      });

      setProject((prev) =>
        prev
          ? {
              ...prev,
              reviews: updatedReviews,
              versions:
                updatedVersions.length > 0 ? updatedVersions : prev.versions,
            }
          : prev,
      );

      await updateProjectReviews({
        projectId: project.id,
        reviewToken: project.reviewToken,
        reviews: updatedReviews,
        versionId: project.activeVersionId || undefined,
        action: "sync",
      });
    } catch (err) {
      console.error("Failed to resolve all reviews:", err);
    } finally {
      setIsResolvingAll(false);
    }
  };

  const handleEditReview = async (reviewId: string) => {
    if (!project?.id || !editingReviewText.trim()) return;
    const targetRev = (project.reviews || []).find((r) => r.id === reviewId);
    if (!targetRev || !canEditReview(targetRev)) return;

    try {
      setIsSavingEdit(true);
      const updatedText = editingReviewText.trim();
      const updatedReviews = (project.reviews || []).map((r) =>
        r.id === reviewId ? { ...r, text: updatedText } : r,
      );
      const updatedVersions = (project.versions || []).map((ver) => {
        if (ver.id === (project.activeVersionId || ver.id)) {
          return {
            ...ver,
            reviews: (ver.reviews || []).map((r) =>
              r.id === reviewId ? { ...r, text: updatedText } : r,
            ),
          };
        }
        return ver;
      });

      setProject((prev) =>
        prev
          ? {
              ...prev,
              reviews: updatedReviews,
              versions: updatedVersions.length > 0 ? updatedVersions : prev.versions,
            }
          : prev,
      );
      setEditingReviewId(null);
      setEditingReviewText("");

      await updateProjectReviews({
        projectId: project.id,
        reviewToken: reviewTokenFromUrl || project.reviewToken,
        reviewId,
        text: updatedText,
        versionId: project.activeVersionId || undefined,
        action: "edit",
      });
    } catch (err) {
      console.error("Failed to edit review:", err);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!project?.id) return;
    const targetRev = (project.reviews || []).find((r) => r.id === reviewId);
    if (!targetRev || !canDeleteReview(targetRev)) return;

    const updatedReviews = (project.reviews || []).filter(
      (r) => r.id !== reviewId,
    );
    const updatedVersions = (project.versions || []).map((ver) => {
      if (ver.id === (project.activeVersionId || ver.id)) {
        return {
          ...ver,
          reviews: (ver.reviews || []).filter((r) => r.id !== reviewId),
        };
      }
      return ver;
    });

    setProject((prev) =>
      prev
        ? {
            ...prev,
            reviews: updatedReviews,
            versions: updatedVersions.length > 0 ? updatedVersions : prev.versions,
          }
        : prev,
    );
    if (activeReviewId === reviewId) setActiveReviewId(null);

    await updateProjectReviews({
      projectId: project.id,
      reviewToken: reviewTokenFromUrl || project.reviewToken,
      reviewId,
      versionId: project.activeVersionId || undefined,
      action: "delete",
    });
  };

  const handleSelectVersion = async (versionId: string) => {
    if (!project?.id || versionId === project.activeVersionId) {
      setShowVersionDropdown(false);
      return;
    }

    const targetVer = (project.versions || []).find((v) => v.id === versionId);
    if (!targetVer) return;

    setShowVersionDropdown(false);
    setActiveReviewId(null);
    setPendingReviewPin(null);
    setIsPlacingReview(false);

    let displaySource = targetVer.sourceImage;
    let displayRender = targetVer.renderedImage;

    if (displaySource && !isDisplayableUrl(displaySource)) {
      displaySource = (await resolveDisplayUrl(displaySource)) || displaySource;
    }
    if (displayRender && !isDisplayableUrl(displayRender)) {
      displayRender = (await resolveDisplayUrl(displayRender)) || displayRender;
    }

    setProject((prev) =>
      prev
        ? {
            ...prev,
            activeVersionId: versionId,
            sourceImage: displaySource,
            renderedImage: displayRender,
            reviews: targetVer.reviews || [],
          }
        : prev,
    );

    setCurrentImage(displayRender || null);

    void switchProjectVersion({
      projectId: project.id,
      versionId,
      reviewToken: reviewTokenFromUrl || project.reviewToken,
    });
  };

  const handleDownloadAsset = async (assetType: "render" | "source") => {
    const targetUrl = assetType === "render" ? currentImage : project?.sourceImage;
    if (!targetUrl) return;

    try {
      let data = await fetchBlobFromUrl(targetUrl);
      if (!data && id) {
        const candidatePaths =
          assetType === "render"
            ? [
                `project/${id}/rendered.png`,
                `project/${id}/rendered.jpg`,
                `project/${id}/rendered.jpeg`,
              ]
            : [
                `project/${id}/source.png`,
                `project/${id}/source.jpg`,
                `project/${id}/source.jpeg`,
                `project/${id}/source.svg`,
              ];
        for (const filePath of candidatePaths) {
          try {
            const blob = await puter.fs.read(filePath);
            if (blob && blob.size > 0) {
              data = { blob, contentType: blob.type || "image/png" };
              break;
            }
          } catch {}
        }
      }

      if (!data) throw new Error("Failed to fetch image blob");

      const ext =
        getImageExtension(data.contentType, targetUrl) ||
        (assetType === "source" && targetUrl.endsWith(".svg") ? "svg" : "png");
      const currentVerObj = project?.versions?.find(
        (v) => v.id === project?.activeVersionId,
      );
      const verLabel = currentVerObj ? `v${currentVerObj.versionNumber}` : "v1";
      const typeLabel = assetType === "render" ? "3D" : "floorplan";
      const projectName = (project?.name || `Residence-${id}`).replace(
        /\s+/g,
        "_",
      );

      const blobUrl = URL.createObjectURL(data.blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `florepy-${projectName}-${verLabel}-${typeLabel}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      setShowExportDropdown(false);
    } catch (error) {
      console.error(`Failed to export ${assetType}:`, error);
    }
  };

  const handleRevisionFileSelect = (selectedFile: File) => {
    const isValidType =
      ALLOWED_IMAGE_TYPES.includes(selectedFile.type) ||
      ALLOWED_FILE_EXTENSIONS.some((ext) =>
        selectedFile.name.toLowerCase().endsWith(ext),
      );
    if (!isValidType) {
      setRevisionError(
        "Unsupported file format. Please upload a JPG, PNG, WEBP, or SVG file.",
      );
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setRevisionError("File size exceeds 10MB limit.");
      return;
    }

    setRevisionError(null);
    setRevisionFile(selectedFile);

    const reader = new FileReader();
    reader.onload = () => {
      setRevisionFileBase64(reader.result as string);
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleCreateRevisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project?.id || !revisionFileBase64 || isCreatingRevision) return;

    if (hasUnresolvedReviews) {
      setRevisionError(
        `Cannot create revision: There are ${unresolvedReviews.length} unresolved comment${
          unresolvedReviews.length > 1 ? "s" : ""
        }. Please resolve all feedback pins first.`,
      );
      return;
    }

    try {
      setIsCreatingRevision(true);
      setRevisionError(null);

      // 1. Run AI 3D visualization on the new revision floor plan
      const genResult = await generate3DView({
        sourceImage: revisionFileBase64,
      });
      const renderedImage = genResult.renderedImage || null;

      // 2. Call createProjectRevision with clean reviews array
      const revisionData = await createProjectRevision({
        projectId: project.id,
        sourceImage: revisionFileBase64,
        renderedImage,
        name: revisionName.trim() || undefined,
        isPublic: Boolean(project.isPublic),
      });

      if (!revisionData || !revisionData.success) {
        throw new Error("Failed to save new revision.");
      }

      // 3. Reset form and update state with empty comments on the new revision
      setShowNewRevisionModal(false);
      setRevisionFile(null);
      setRevisionFileBase64(null);
      setRevisionName("");

      const finalRender =
        renderedImage ||
        (revisionData.currentVersion?.renderedImage
          ? await resolveDisplayUrl(revisionData.currentVersion.renderedImage)
          : null);
      const finalSource = revisionFileBase64;

      setProject((prev) =>
        prev
          ? {
              ...prev,
              activeVersionId: revisionData.activeVersionId,
              versions: revisionData.versions || prev.versions,
              sourceImage: finalSource,
              renderedImage: finalRender,
              reviews: [], // Fresh comment thread for the new revision!
            }
          : prev,
      );

      setCurrentImage(finalRender || null);
    } catch (err: any) {
      console.error("Revision creation failed:", err);
      setRevisionError(
        err.message || "Failed to create new revision. Please try again.",
      );
    } finally {
      setIsCreatingRevision(false);
    }
  };

  const runGeneration = async (item: DesignItem) => {
    if (!id || !item.sourceImage) return;

    try {
      setIsProcessing(true);

      const result = await generate3DView({ sourceImage: item.sourceImage });
      if (result.renderedImage) {
        // Retain the generated data URL immediately for instant feedback
        const displayableRender = result.renderedImage;
        const displayableSource = isDisplayableUrl(project?.sourceImage)
          ? project!.sourceImage!
          : item.sourceImage;

        setCurrentImage(displayableRender);

        // Preserve current public state instead of downgrading
        const isProjectPublic = Boolean(item.isPublic);

        // put this image in the kv of the project which is already present
        const updatedItem: DesignItem = {
          ...item,
          renderedImage: result.renderedImage,
          renderedPath: result.renderedPath,
          timestamp: Date.now(),
          ownerId: item.ownerId ?? userId ?? null,
          ownerName: item.ownerName ?? userName ?? null,
          isPublic: isProjectPublic,
        };

        const saved = await createProject({
          item: updatedItem,
          isPublic: isProjectPublic,
          isUpdate: true,
        });

        if (saved) {
          const finalSource = isDisplayableUrl(saved.sourceImage)
            ? saved.sourceImage
            : displayableSource;
          const finalRender = isDisplayableUrl(saved.renderedImage)
            ? saved.renderedImage
            : displayableRender;

          setProject({
            ...saved,
            sourceImage: finalSource,
            renderedImage: finalRender,
          });
          setCurrentImage(finalRender || null);
        } else {
          setProject((prev) =>
            prev
              ? {
                  ...prev,
                  renderedImage: displayableRender,
                }
              : prev,
          );
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

      const fetchedProject = await getProjectById({
        id,
        reviewToken: reviewTokenFromUrl,
      });

      if (!isMounted) return;

      if (fetchedProject) {
        // Check if project has a review passcode enabled and caller is a client
        const storedPasscode = fetchedProject.reviewPasscode;
        const callerIsOwner = Boolean(
          (userId &&
            fetchedProject.ownerId &&
            userId === fetchedProject.ownerId) ||
          (userName &&
            fetchedProject.ownerName &&
            userName.toLowerCase() === fetchedProject.ownerName.toLowerCase()),
        );

        if (!callerIsOwner && reviewTokenFromUrl && storedPasscode) {
          const unlockedKey = `florepy_unlocked_${id}`;
          const isSessionUnlocked =
            sessionStorage.getItem(unlockedKey) === "true";
          if (!isSessionUnlocked) {
            setIsReviewLocked(true);
          }
        }
        const activeVer =
          (fetchedProject.versions || []).find(
            (v) => v.id === fetchedProject.activeVersionId,
          ) || fetchedProject.versions?.[0];

        let sourceUrl = activeVer?.sourceImage || fetchedProject.sourceImage;
        let renderUrl =
          activeVer?.renderedImage !== undefined
            ? activeVer.renderedImage
            : fetchedProject.renderedImage;
        const currentReviews =
          activeVer?.reviews || fetchedProject.reviews || [];

        if (sourceUrl && !isDisplayableUrl(sourceUrl)) {
          sourceUrl = (await resolveDisplayUrl(sourceUrl)) || sourceUrl;
        }
        if (renderUrl && !isDisplayableUrl(renderUrl)) {
          renderUrl = (await resolveDisplayUrl(renderUrl)) || renderUrl;
        }

        const finalizedProject = {
          ...fetchedProject,
          sourceImage: sourceUrl,
          renderedImage: renderUrl,
          reviews: currentReviews,
        };

        if (fetchedProject.clientCanViewVersions !== undefined) {
          setAllowClientVersions(Boolean(fetchedProject.clientCanViewVersions));
        }

        setProject(finalizedProject);
        setCurrentImage(renderUrl || null);
      } else {
        setProject(null);
        setCurrentImage(null);
      }
      setIsProjectLoading(false);
      hasInitialGenerated.current = false;
    };

    loadProject();

    return () => {
      isMounted = false;
    };
  }, [id]);

  // Safety guard: ensure any unresolved Puter FS paths get resolved into displayable blob URLs
  useEffect(() => {
    let isCurrent = true;

    if (project?.sourceImage && !isDisplayableUrl(project.sourceImage)) {
      resolveDisplayUrl(project.sourceImage).then((resolved) => {
        if (isCurrent && resolved && isDisplayableUrl(resolved)) {
          setProject((prev) =>
            prev ? { ...prev, sourceImage: resolved } : prev,
          );
        }
      });
    }

    if (currentImage && !isDisplayableUrl(currentImage)) {
      resolveDisplayUrl(currentImage).then((resolved) => {
        if (isCurrent && resolved && isDisplayableUrl(resolved)) {
          setCurrentImage(resolved);
        }
      });
    }

    return () => {
      isCurrent = false;
    };
  }, [project?.sourceImage, currentImage]);

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
            <div className="render-area bg-zinc-200/50"></div>
          </div>
        ) : !project ? (
          <ProjectNotFound id={id} />
        ) : (
          <div className="panel shadow-sm">
            <div className="panel-header">
              <div className="panel-meta">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">
                    Project
                  </p>
                  {(isOwner || project?.clientCanViewVersions) &&
                    project?.versions &&
                    project.versions.length > 0 && (
                      <div className="relative inline-block">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowVersionDropdown((prev) => !prev);
                            setShowExportDropdown(false);
                          }}
                          className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-semibold rounded-md bg-zinc-100 hover:bg-zinc-200/80 text-zinc-800 transition-colors cursor-pointer border border-zinc-200/70"
                          title="Click to view and switch revisions"
                        >
                          <GitBranch size={11} className="text-zinc-500" />
                          <span>
                            {project.versions.find(
                              (v) => v.id === project.activeVersionId,
                            )?.name ||
                              `Version ${
                                project.versions.find(
                                  (v) => v.id === project.activeVersionId,
                                )?.versionNumber || 1
                              }`}
                          </span>
                          <ChevronDown size={11} className="text-zinc-500" />
                        </button>

                        {showVersionDropdown && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute top-full left-0 mt-1 w-64 bg-white rounded-xl shadow-lg border border-zinc-200/80 p-1.5 z-50 space-y-1"
                          >
                            <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                              <span>Project Revisions</span>
                              <span>
                                {project.versions.length} /{" "}
                                {project.maxVersions || 5}
                              </span>
                            </div>
                            <div className="max-h-52 overflow-y-auto space-y-0.5">
                              {project.versions.map((ver) => {
                                const isSelected =
                                  ver.id ===
                                  (project.activeVersionId ||
                                    project.versions![0].id);
                                const reviewCount = ver.reviews?.length || 0;
                                return (
                                  <button
                                    key={ver.id}
                                    type="button"
                                    onClick={() =>
                                      void handleSelectVersion(ver.id)
                                    }
                                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                                      isSelected
                                        ? "bg-zinc-100 text-zinc-950 font-semibold"
                                        : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                    }`}
                                  >
                                    <div className="truncate pr-2">
                                      <p className="truncate text-xs font-medium">
                                        {ver.name ||
                                          `Version ${ver.versionNumber}`}
                                      </p>
                                      <p className="text-[10px] text-zinc-400 flex items-center gap-1">
                                        <Clock size={10} />{" "}
                                        {new Date(
                                          ver.timestamp,
                                        ).toLocaleDateString()}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {reviewCount > 0 && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-200/60 text-zinc-600">
                                          {reviewCount}
                                        </span>
                                      )}
                                      {isSelected && (
                                        <Check
                                          size={12}
                                          className="text-emerald-600"
                                        />
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                            {isOwner && (
                              <div className="pt-1 border-t border-zinc-100">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowVersionDropdown(false);
                                    setShowNewRevisionModal(true);
                                  }}
                                  className="w-full px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-zinc-50 rounded-lg flex items-center justify-between transition-colors cursor-pointer"
                                >
                                  <span className="flex items-center gap-1.5">
                                    <UploadCloud size={13} />
                                    <span>Upload New Revision</span>
                                  </span>
                                  {hasUnresolvedReviews && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-semibold">
                                      {unresolvedReviews.length} to resolve
                                    </span>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                </div>
                <h2>{project?.name || `Residence ${id}`}</h2>
                <p className="note">
                  Created by{" "}
                  {isOwner ? "you" : project?.ownerName || "Community Member"}{" "}
                  &bull; Drag slider to compare
                </p>
              </div>
              <div className="panel-actions flex items-center gap-1.5 sm:gap-2">
                {canAddReview && areReviewsVisible && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (!isPlacingReview) {
                        setReviewLockedView("3d");
                      }
                      setIsPlacingReview(!isPlacingReview);
                      setActiveReviewId(null);
                    }}
                    className={`h-8 sm:h-9 w-22 sm:w-24 px-2.5 sm:px-3 text-[11px] sm:text-xs rounded-lg shadow-xs flex items-center justify-center transition-colors ${
                      isPlacingReview
                        ? "!text-primary font-semibold"
                        : "text-zinc-800 font-medium"
                    }`}
                    disabled={isProcessing}
                    title="Lock into 3D view and drop a review pin"
                  >
                    <span>{isPlacingReview ? "Done" : "Add Review"}</span>
                  </Button>
                )}
                {isOwner && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowNewRevisionModal(true)}
                    disabled={isProcessing}
                    title={
                      hasUnresolvedReviews
                        ? `Resolve all ${unresolvedReviews.length} comments to create new revision`
                        : "Upload updated floor plan for next revision iteration"
                    }
                    className={`h-8 sm:h-9 px-2.5 sm:px-3 text-[11px] sm:text-xs rounded-lg shadow-xs flex items-center justify-center font-medium ${
                      hasUnresolvedReviews
                        ? "text-zinc-700 bg-zinc-50 border-zinc-200"
                        : "text-zinc-800 border-zinc-300 hover:border-zinc-400"
                    }`}
                  >
                    <UploadCloud className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
                    <span className="hidden sm:inline">New Revision</span>
                    <span className="sm:hidden">Revision</span>
                    {hasUnresolvedReviews && (
                      <span
                        className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 font-semibold"
                        title={`${unresolvedReviews.length} unresolved comments`}
                      >
                        {unresolvedReviews.length}
                      </span>
                    )}
                  </Button>
                )}
                <div className="relative inline-block">
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowExportDropdown((prev) => !prev);
                      setShowVersionDropdown(false);
                    }}
                    className="export"
                    disabled={
                      (!currentImage && !project?.sourceImage) || isProcessing
                    }
                  >
                    <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
                    Export
                    <ChevronDown className="w-3 h-3 ml-1 opacity-70" />
                  </Button>

                  {showExportDropdown && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-full right-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-zinc-200/80 p-1 z-50 space-y-0.5"
                    >
                      <button
                        type="button"
                        onClick={() => void handleDownloadAsset("render")}
                        disabled={!currentImage}
                        className="w-full text-left px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 rounded-lg flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <FileImage size={13} className="text-zinc-500" />
                        <span>Download 3D Render</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDownloadAsset("source")}
                        disabled={!project?.sourceImage}
                        className="w-full text-left px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 rounded-lg flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <FileDown size={13} className="text-zinc-500" />
                        <span>Download Floor Plan</span>
                      </button>
                    </div>
                  )}
                </div>
                {isOwner ? (
                  <Button
                    size="sm"
                    onClick={handleShareClick}
                    className="share"
                    disabled={!currentImage || isProcessing || isSharing}
                  >
                    <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />{" "}
                    Share
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={copyShareLink}
                    className="share"
                    disabled={!currentImage || isProcessing}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5 text-emerald-500" />{" "}
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />{" "}
                        Copy Link
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
            <div
              ref={renderAreaRef}
              className={`render-area ${isProcessing ? "is-processing" : ""} ${isPlacingReview ? "cursor-crosshair" : ""}`}
              onClick={handleCanvasClick}
            >
              {isReviewLocked ? (
                <div className="flex flex-col items-center justify-center w-full h-full text-center p-6 text-zinc-400">
                  <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center mb-2.5 text-zinc-500 font-semibold text-xs">
                    Florepy
                  </div>
                  <p className="text-sm font-semibold text-zinc-700">
                    Protected Design Review
                  </p>
                  <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                    Please enter the passcode provided by the builder to unlock
                    this review.
                  </p>
                </div>
              ) : isAddingComment && isDisplayableUrl(currentImage) ? (
                /* When adding comments, slider locks completely to 3D View (or Plan View) */
                <img
                  src={
                    reviewLockedView === "plan" &&
                    isDisplayableUrl(project?.sourceImage)
                      ? project!.sourceImage!
                      : currentImage!
                  }
                  alt={
                    reviewLockedView === "plan"
                      ? "Floor Plan"
                      : "3D Visualization"
                  }
                  className="render-img w-full h-full object-contain"
                  onLoad={handleImageLoad}
                />
              ) : isDisplayableUrl(currentImage) &&
                isDisplayableUrl(project?.sourceImage) &&
                !isProcessing ? (
                <ReactCompareSlider
                  defaultValue={50}
                  style={{
                    width: "100%",
                    height: "100%",
                    position: "absolute",
                    inset: 0,
                  }}
                  itemOne={
                    <ReactCompareSliderImage
                      src={project!.sourceImage!}
                      alt="before"
                      className="render-img w-full h-full"
                      style={{ objectFit: "contain" }}
                      onLoad={handleImageLoad}
                    />
                  }
                  itemTwo={
                    <ReactCompareSliderImage
                      src={currentImage!}
                      alt="after"
                      className="render-img w-full h-full"
                      style={{ objectFit: "contain" }}
                      onLoad={handleImageLoad}
                    />
                  }
                />
              ) : isDisplayableUrl(currentImage) ? (
                <img
                  src={currentImage!}
                  alt="AI Render"
                  className="render-img"
                  onLoad={handleImageLoad}
                />
              ) : (
                <div className="render-placeholder flex items-center justify-center w-full h-full absolute inset-0">
                  {isDisplayableUrl(project?.sourceImage) ? (
                    <img
                      src={project!.sourceImage!}
                      alt="Original"
                      className="render-fallback object-contain w-full h-full max-h-[80vh]"
                      onLoad={handleImageLoad}
                    />
                  ) : (
                    <div className="w-full h-full bg-zinc-200/50 animate-pulse flex items-center justify-center text-zinc-400 text-sm font-medium">
                      Loading preview...
                    </div>
                  )}
                </div>
              )}

              {/* Floating Helper Banner when Placing Pin in Locked View */}
              {isPlacingReview && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-zinc-950/90 backdrop-blur-md text-white text-xs px-3.5 py-1.5 rounded-full shadow-lg border border-zinc-800"
                >
                  <span className="font-medium">
                    Click on {reviewLockedView === "plan" ? "Plan" : "3D view"}{" "}
                    to place pin
                  </span>
                  <div className="h-3 w-px bg-zinc-700 mx-0.5" />
                  <div className="flex items-center gap-0.5 bg-zinc-800/90 rounded-full p-0.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setReviewLockedView("3d")}
                      className={`px-2 py-0.5 rounded-full transition-colors cursor-pointer ${
                        reviewLockedView === "3d"
                          ? "bg-primary text-white font-semibold"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      3D View
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewLockedView("plan")}
                      className={`px-2 py-0.5 rounded-full transition-colors cursor-pointer ${
                        reviewLockedView === "plan"
                          ? "bg-primary text-white font-semibold"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      Plan
                    </button>
                  </div>
                </div>
              )}

              {/* Spatial Review Pins Overlay (Geometrically locked to active image bounds) */}
              {areReviewsVisible && (
                <div
                  style={
                    imageBounds.width > 0
                      ? {
                          position: "absolute",
                          left: `${imageBounds.left}px`,
                          top: `${imageBounds.top}px`,
                          width: `${imageBounds.width}px`,
                          height: `${imageBounds.height}px`,
                        }
                      : {
                          position: "absolute",
                          inset: 0,
                        }
                  }
                  className="z-30 pointer-events-none"
                >
                  {/* Pending Review Placement Marker on the Image */}
                  {pendingReviewPin && (
                    <div
                      style={{
                        left: `${pendingReviewPin.x}%`,
                        top: `${pendingReviewPin.y}%`,
                      }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-40"
                    >
                      <div className="w-6 h-6 rounded-full bg-primary text-white font-bold text-xs flex items-center justify-center animate-bounce shadow-lg ring-2 ring-white">
                        +
                      </div>
                    </div>
                  )}

                  {Array.isArray(project?.reviews) &&
                    project.reviews.map((rev, index) => {
                      const isSelected = activeReviewId === rev.id;
                      const openDownwards = rev.y < 35;
                      const alignClass =
                        rev.x < 25
                          ? "left-0"
                          : rev.x > 75
                            ? "right-0 left-auto"
                            : "left-1/2 -translate-x-1/2";
                      const verticalClass = openDownwards
                        ? "top-8"
                        : "bottom-8";

                      return (
                        <div
                          key={rev.id}
                          style={{ left: `${rev.x}%`, top: `${rev.y}%` }}
                          className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveReviewId(isSelected ? null : rev.id);
                            }}
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shadow-md transition-transform cursor-pointer ${
                              rev.resolved
                                ? "bg-emerald-600 text-white"
                                : isSelected
                                  ? "bg-primary text-white ring-2 ring-primary/40"
                                  : "bg-zinc-950 text-white"
                            }`}
                            title={`Review ${index + 1} by ${rev.author}: ${rev.text}`}
                          >
                            {rev.resolved ? <Check size={11} /> : index + 1}
                          </button>

                          {/* Review Popover Card */}
                          {isSelected && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className={`absolute ${alignClass} ${verticalClass} w-max min-w-[140px] max-w-[min(340px,85vw)] bg-white/95 backdrop-blur-md rounded-lg p-2.5 shadow-xl border border-zinc-200 text-left z-40 transition-all text-zinc-900`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-[11px] font-semibold text-zinc-900 truncate">
                                    {rev.author}
                                  </p>
                                  <p className="text-[9.5px] text-zinc-400">
                                    {new Date(
                                      rev.createdAt,
                                    ).toLocaleDateString()}
                                  </p>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  {/* Resolved toggle for owner */}
                                  {isOwner ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleToggleResolveReview(rev.id)
                                      }
                                      title={
                                        rev.resolved
                                          ? "Cancel resolved status (unresolve)"
                                          : "Click to mark resolved"
                                      }
                                      className={`p-1 rounded transition-colors cursor-pointer ${
                                        rev.resolved
                                          ? "text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100"
                                          : "text-zinc-400 hover:text-emerald-600 hover:bg-zinc-100"
                                      }`}
                                    >
                                      {rev.resolved ? (
                                        <X size={13} className="stroke-3" />
                                      ) : (
                                        <Check size={13} className="stroke-3" />
                                      )}
                                    </button>
                                  ) : rev.resolved ? (
                                    <span
                                      title="Resolved by builder"
                                      className="p-1 rounded bg-emerald-50 text-emerald-600 flex items-center"
                                    >
                                      <Check
                                        size={12}
                                        className="stroke-[2.5]"
                                      />
                                    </span>
                                  ) : null}

                                  {/* Edit comment (client author only, never owner) */}
                                  {canEditReview(rev) && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingReviewId(rev.id);
                                        setEditingReviewText(rev.text);
                                      }}
                                      title="Edit comment"
                                      className="p-1 rounded text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer"
                                    >
                                      <Pencil size={12} />
                                    </button>
                                  )}

                                  {/* Delete trash icon: only when resolved for owner, or if author */}
                                  {canDeleteReview(rev) && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteReview(rev.id)}
                                      title="Delete comment"
                                      className="p-1 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {editingReviewId === rev.id ? (
                                <div className="pt-1 space-y-1.5 min-w-[200px]">
                                  <textarea
                                    rows={2}
                                    value={editingReviewText}
                                    onChange={(e) =>
                                      setEditingReviewText(e.target.value)
                                    }
                                    autoFocus
                                    className="w-full text-[11px] bg-zinc-50 border border-zinc-300 focus:border-zinc-950 rounded-md p-1.5 outline-none text-zinc-900 resize-none"
                                  />
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingReviewId(null);
                                        setEditingReviewText("");
                                      }}
                                      className="px-2 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-800 cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      disabled={
                                        isSavingEdit ||
                                        !editingReviewText.trim()
                                      }
                                      onClick={() => handleEditReview(rev.id)}
                                      className="px-2.5 py-0.5 text-[10px] font-semibold text-white bg-zinc-950 hover:bg-black rounded-md transition-colors cursor-pointer disabled:opacity-40"
                                    >
                                      {isSavingEdit ? "Saving..." : "Save"}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="max-h-48 overflow-y-auto pr-0.5">
                                  <p className="text-[11px] text-zinc-700 pt-1.5 leading-relaxed break-words whitespace-pre-wrap">
                                    {rev.text}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Pending Review Placement Modal */}
              {pendingReviewPin && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute z-40 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-80 max-w-[calc(100vw-32px)] bg-white rounded-xl shadow-2xl border border-zinc-200 p-3.5 space-y-2.5 text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-900 flex items-center gap-1.5">
                      New Review Pin
                    </span>
                    <button
                      type="button"
                      onClick={() => setPendingReviewPin(null)}
                      className="text-zinc-400 hover:text-zinc-600"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                      Your Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Sarah, Architect"
                      value={isSignedIn && userName ? userName : reviewerName}
                      readOnly={Boolean(isSignedIn && userName)}
                      onChange={(e) => setReviewerName(e.target.value)}
                      className={`w-full text-xs rounded-md px-2.5 py-1.5 outline-none ${
                        isSignedIn && userName
                          ? "bg-zinc-100 text-zinc-600 border border-zinc-200 cursor-not-allowed"
                          : "bg-zinc-50 border border-zinc-200 focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950 text-zinc-900"
                      }`}
                      required
                    />
                    {isSignedIn && userName ? (
                      <p className="text-[10px] text-zinc-400 mt-1">
                        Using your account name ({userName})
                      </p>
                    ) : (
                      <p className="text-[10px] text-zinc-400 mt-1">
                        Remembered on this device for your reviews
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                      Feedback / Note <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Describe your review (e.g. change living room flooring to oak)..."
                      value={reviewText}
                      onChange={(e) => setReviewText(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                          e.preventDefault();
                          const author = (
                            isSignedIn && userName ? userName : reviewerName
                          ).trim();
                          if (
                            reviewText.trim() &&
                            author &&
                            !isSubmittingReview
                          ) {
                            void handleAddReview();
                          }
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setPendingReviewPin(null);
                        }
                      }}
                      autoFocus
                      className="w-full text-xs bg-zinc-50 border border-zinc-200 focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950 rounded-md p-2 outline-none text-zinc-900 resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setPendingReviewPin(null)}
                      className="px-2.5 py-1.5 text-xs text-zinc-500 hover:text-zinc-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={
                        isSubmittingReview ||
                        !reviewText.trim() ||
                        !(
                          isSignedIn && userName ? userName : reviewerName
                        ).trim()
                      }
                      onClick={handleAddReview}
                      className="px-3.5 py-1.5 text-xs font-semibold text-white bg-zinc-950 hover:bg-black rounded-md transition-colors cursor-pointer disabled:opacity-40"
                    >
                      {isSubmittingReview ? "Posting..." : "Post Review"}
                    </button>
                  </div>
                </div>
              )}

              {isProcessing && (
                <div className="render-overlay absolute inset-0 z-20 flex items-center justify-center bg-zinc-100/80 backdrop-blur-sm">
                  <div className="rendering-card bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl shadow-sm flex flex-col items-center max-w-[85vw] sm:max-w-none">
                    <RefreshCcw className="spinner animate-spin text-primary w-6 h-6 sm:w-8 sm:h-8 mb-2.5 sm:mb-4" />
                    <span className="title font-bold text-base sm:text-lg mb-0.5 sm:mb-1">
                      Rendering...
                    </span>
                    <span className="subtitle text-xs sm:text-sm text-zinc-500 text-center">
                      Generating your 3D visualization...
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Share Modal */}
      <Modal
        isOpen={showShareModal && isOwner}
        onClose={() => setShowShareModal(false)}
        title="Share Project"
        disabled={isSharing}
        maxWidth="md"
      >
        <div className="space-y-4">
          {/* Dual-Tab Navigation */}
          <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-lg">
            <button
              type="button"
              onClick={() => setShareTab("review")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                shareTab === "review"
                  ? "bg-white text-zinc-950 shadow-xs"
                  : "text-zinc-600 hover:text-zinc-950"
              }`}
            >
              <MessageSquare size={13} />
              <span>Client Review</span>
            </button>
            <button
              type="button"
              onClick={() => setShareTab("public")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                shareTab === "public"
                  ? "bg-white text-zinc-950 shadow-xs"
                  : "text-zinc-600 hover:text-zinc-950"
              }`}
            >
              <Globe size={13} />
              <span>Public Showcase</span>
            </button>
          </div>

          {/* TAB 1: CLIENT REVIEW */}
          {shareTab === "review" && (
            <div className="space-y-3.5 pt-1">
              <p className="text-xs text-zinc-500 leading-normal">
                Share this private link with clients to collect pin reviews.
                Hidden from the public feed.
              </p>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1.5">
                  Client Review Link
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={getClientReviewUrl()}
                    className="w-full text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-md px-2.5 py-2 text-zinc-700 select-all outline-none truncate"
                  />
                  <button
                    type="button"
                    onClick={copyClientReviewLink}
                    className="shrink-0 px-3 py-2 text-xs font-medium rounded-md bg-zinc-950 text-white hover:bg-black transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    {copiedReview ? (
                      <>
                        <Check size={12} className="text-emerald-400" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy size={12} /> Copy Link
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Optional Passcode Settings */}
              <div className="pt-2 border-t border-zinc-100 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="passcode-toggle"
                    className="text-xs font-medium text-zinc-800 cursor-pointer"
                  >
                    Protect with Review Passcode
                  </label>
                  <input
                    id="passcode-toggle"
                    type="checkbox"
                    checked={enablePasscode}
                    disabled={isSavingPasscode}
                    onChange={(e) =>
                      void handleTogglePasscode(e.target.checked)
                    }
                    className="rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950 cursor-pointer"
                  />
                </div>

                {enablePasscode && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        maxLength={12}
                        placeholder="Enter passcode (e.g. 4821)"
                        value={passcodeInput}
                        onChange={(e) => setPasscodeInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleSavePasscode();
                          }
                        }}
                        autoFocus
                        className="w-full text-xs bg-white border border-zinc-200 focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950 rounded-md px-2.5 py-1.5 text-zinc-900 outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleSavePasscode}
                        disabled={isSavingPasscode || !passcodeInput.trim()}
                        className="shrink-0 text-xs font-medium text-white bg-zinc-950 hover:bg-black px-3 py-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        {isSavingPasscode ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          "Save"
                        )}
                      </button>
                    </div>

                    {passcodeToast && (
                      <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1 transition-all duration-200">
                        <Check size={12} /> {passcodeToast}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Version History Settings for Client */}
              <div className="pt-2 border-t border-zinc-100 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label
                      htmlFor="versions-client-toggle"
                      className="text-xs font-medium text-zinc-800 cursor-pointer block"
                    >
                      Allow Client to Browse Revision History
                    </label>
                    <p className="text-[10px] text-zinc-400 mt-0.5">
                      Permits clients to view earlier versions and verify addressed feedback.
                    </p>
                  </div>
                  <input
                    id="versions-client-toggle"
                    type="checkbox"
                    checked={allowClientVersions}
                    disabled={isSavingVersionSettings}
                    onChange={(e) =>
                      void handleToggleClientVersions(e.target.checked)
                    }
                    className="rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950 cursor-pointer ml-3 shrink-0"
                  />
                </div>
                <p className="text-[10px] text-zinc-400 flex items-center gap-1 pt-0.5">
                  <Clock size={11} className="text-zinc-400 shrink-0" />
                  <span>
                    Retention cap: Keeps up to {project?.maxVersions || 5} versions for {project?.retentionDays || 30} days.
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: PUBLIC SHOWCASE */}
          {shareTab === "public" && (
            <div className="space-y-3 pt-1">
              {project?.isPublic ? (
                <div className="space-y-3">
                  <p className="text-xs text-zinc-500 leading-normal">
                    This project is live in the Community Feed. Client reviews
                    are kept hidden from public showcase visitors.
                  </p>

                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={`${typeof window !== "undefined" ? window.location.origin : ""}/visualizer/${id}`}
                      className="w-full text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-md px-2.5 py-2 text-zinc-700 select-all outline-none truncate"
                    />
                    <button
                      type="button"
                      onClick={copyShareLink}
                      className="shrink-0 px-3 py-2 text-xs font-medium rounded-md bg-zinc-950 text-white hover:bg-black transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      {copied ? (
                        <>
                          <Check size={12} className="text-emerald-400" />{" "}
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy size={12} /> Copy Link
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-[11px] text-zinc-400">
                    <span className="flex items-center gap-1.5 text-zinc-500 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Public Showcase Live
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
                      <h4 className="text-xs font-semibold text-zinc-900">
                        Not in Community Showcase
                      </h4>
                      <p className="text-[11px] text-zinc-500 leading-snug mt-0.5">
                        Publishing adds this 3D render to the Florepy Community
                        Feed. Internal reviews will not be shown.
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end items-center pt-1">
                    <button
                      type="button"
                      onClick={handleConfirmShare}
                      disabled={isSharing}
                      className="text-xs font-medium text-white bg-zinc-950 hover:bg-black px-3.5 py-2 rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      {isSharing ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />{" "}
                          Publishing...
                        </>
                      ) : (
                        <>
                          <Globe size={12} /> Publish to Showcase
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Upload New Revision Modal for Builder */}
      <Modal
        isOpen={showNewRevisionModal && isOwner}
        onClose={() => {
          if (!isCreatingRevision) {
            setShowNewRevisionModal(false);
            setRevisionFile(null);
            setRevisionFileBase64(null);
            setRevisionError(null);
          }
        }}
        title="Upload New Project Revision"
        disabled={isCreatingRevision}
        maxWidth="md"
      >
        <form onSubmit={handleCreateRevisionSubmit} className="space-y-4 pt-1">
          <p className="text-xs text-zinc-500 leading-normal">
            Upload an updated floor plan based on client review feedback.
            This creates a new iteration with a fresh review thread while
            preserving past versions and comments.
          </p>

          {hasUnresolvedReviews && (
            <div className="flex items-center justify-between text-xs text-amber-600 pt-0.5">
              <p>
                <span className="font-semibold text-amber-600">
                  {unresolvedReviews.length} unresolved{" "}
                  {unresolvedReviews.length === 1 ? "comment" : "comments"}.
                </span>{" "}
                Resolve all comments to create a new revision.
              </p>
              <button
                type="button"
                onClick={handleResolveAllReviews}
                disabled={isResolvingAll}
                className="text-xs font-semibold text-amber-700 hover:text-amber-800 hover:underline cursor-pointer disabled:opacity-50 shrink-0 ml-3"
              >
                {isResolvingAll ? "Resolving..." : "Resolve All"}
              </button>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
              Revision Label (Optional)
            </label>
            <input
              type="text"
              placeholder={`Revision ${(project?.versions?.length || 0) + 1} (e.g. Updated Kitchen & Patio)`}
              value={revisionName}
              onChange={(e) => setRevisionName(e.target.value)}
              disabled={isCreatingRevision}
              className="w-full text-xs bg-zinc-50 border border-zinc-200 focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950 rounded-md px-2.5 py-2 text-zinc-900 outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-700 mb-1.5">
              Floor Plan File (JPG, PNG, WEBP, SVG){" "}
              <span className="text-red-500">*</span>
            </label>
            <div
              className={`border-2 border-dashed rounded-xl p-4 sm:p-6 text-center transition-colors ${
                revisionFile
                  ? "border-emerald-400 bg-emerald-50/20"
                  : "border-zinc-200 hover:border-zinc-400 bg-zinc-50/50"
              }`}
            >
              {revisionFile ? (
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-semibold text-xs">
                    <Check size={16} />
                  </div>
                  <p className="text-xs font-semibold text-zinc-800">
                    {revisionFile.name}
                  </p>
                  <p className="text-[10px] text-zinc-400">
                    {(revisionFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setRevisionFile(null);
                      setRevisionFileBase64(null);
                    }}
                    className="text-[11px] text-red-500 hover:underline mt-1 cursor-pointer"
                  >
                    Choose a different file
                  </button>
                </div>
              ) : (
                <div>
                  <UploadCloud className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
                  <p className="text-xs text-zinc-700 font-medium mb-1">
                    Drag and drop your updated floor plan here, or click to browse
                  </p>
                  <p className="text-[10px] text-zinc-400 mb-3">
                    Up to 10MB per file
                  </p>
                  <label className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-md bg-zinc-950 text-white hover:bg-black transition-colors cursor-pointer">
                    Browse File
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.svg"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleRevisionFileSelect(file);
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
            {revisionError && (
              <p className="text-[11px] text-red-600 font-medium mt-1.5">
                {revisionError}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
            <button
              type="button"
              disabled={isCreatingRevision}
              onClick={() => {
                setShowNewRevisionModal(false);
                setRevisionFile(null);
                setRevisionFileBase64(null);
                setRevisionError(null);
              }}
              className="px-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-900 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isCreatingRevision ||
                !revisionFileBase64 ||
                hasUnresolvedReviews
              }
              className="px-4 py-2 text-xs font-semibold text-white bg-zinc-950 hover:bg-black rounded-md transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
            >
              {isCreatingRevision ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Generating 3D Revision...
                </>
              ) : hasUnresolvedReviews ? (
                <span>Resolve Comments to Create</span>
              ) : (
                <>
                  <UploadCloud size={13} />
                  Create Revision
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Review Passcode Lock Modal for Client */}
      <Modal
        isOpen={isReviewLocked}
        onClose={() => {}}
        title="Protected Review"
        showCloseButton={false}
        maxWidth="sm"
      >
        <form onSubmit={handleUnlockPasscode} className="space-y-3 pt-1">
          <p className="text-zinc-600 text-xs">
            This design review is password-protected by the builder.
          </p>

          <div>
            <input
              type="password"
              placeholder="Enter review passcode"
              value={enteredPasscode}
              onChange={(e) => {
                setEnteredPasscode(e.target.value);
                setPasscodeError(false);
              }}
              autoFocus
              className="w-full text-xs bg-white border border-zinc-200 focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950 rounded-md px-3 py-2 text-zinc-900 outline-none"
            />
            {passcodeError && (
              <p className="text-[11px] text-red-600 font-medium mt-1">
                Incorrect passcode. Please try again.
              </p>
            )}
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={!enteredPasscode.trim()}
              className="text-xs font-medium text-white bg-zinc-950 hover:bg-black px-4 py-2 rounded-md transition-colors cursor-pointer disabled:opacity-40"
            >
              Unlock Review
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default VisualizerId;
