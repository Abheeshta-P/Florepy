interface AuthState {
  isSignedIn: boolean;
  isAuthLoading: boolean;
  userName: string | null;
  userId: string | null;
}

interface Material {
  id: string;
  name: string;
  thumbnail: string;
  type: "color" | "texture";
  category: "floor" | "wall" | "furniture";
}

interface ProjectReview {
  id: string;
  x: number; // percentage (0-100)
  y: number; // percentage (0-100)
  author: string;
  text: string;
  createdAt: number;
  resolved?: boolean;
}

interface ProjectVersion {
  id: string;
  versionNumber: number;
  name?: string;
  sourceImage: string;
  sourcePath?: string | null;
  renderedImage?: string | null;
  renderedPath?: string | null;
  timestamp: number;
  createdAt: string;
  reviews?: ProjectReview[];
}

interface DesignItem {
  id: string;
  name?: string | null;
  sourceImage: string;
  sourcePath?: string | null;
  renderedImage?: string | null;
  renderedPath?: string | null;
  publicPath?: string | null;
  timestamp: number;
  ownerId?: string | null;
  ownerName?: string | null;
  sharedAt?: string | null;
  isPublic?: boolean;
  isOwner?: boolean;
  reviewToken?: string | null;
  reviewPasscode?: string | null;
  reviews?: ProjectReview[];

  // Versioning System
  activeVersionId?: string | null;
  versions?: ProjectVersion[];
  maxVersions?: number;
  retentionDays?: number;
}

interface DesignConfig {
  floor: string;
  walls: string;
  style: string;
}

enum AppStatus {
  IDLE = "IDLE",
  UPLOADING = "UPLOADING",
  PROCESSING = "PROCESSING",
  READY = "READY",
}

type RenderCompletePayload = {
  renderedImage: string;
  renderedPath?: string;
};

type VisualizerLocationState = {
  initialImage?: string;
  initialRender?: string | null;
  ownerId?: string | null;
  name?: string | null;
  ownerName?: string | null;
};

interface VisualizerProps {
  onBack: () => void;
  initialImage: string | null;
  onRenderComplete?: (payload: RenderCompletePayload) => void;
  onShare?: (image: string) => Promise<void> | void;
  onUnshare?: (image: string) => Promise<void> | void;
  projectName?: string;
  projectId?: string;
  initialRender?: string | null;
  isPublic?: boolean;
  ownerName?: string | null;
  canUnshare?: boolean;
}

interface UploadProps {
  onComplete: (base64File: string) => Promise<boolean | void> | boolean | void;
  className?: string;
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
}

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
}

type AuthContext = {
  isSignedIn: boolean;
  isAuthLoading: boolean;
  userName: string | null;
  userId: string | null;
  refreshAuth: () => Promise<boolean>;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<boolean>;
};

type AuthRequiredModalProps = {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
};

type ShareAction = "share" | "unshare";
type ShareStatus = "idle" | "saving" | "done";

type HostingConfig = { subdomain: string };
type HostedAsset = { url: string };

interface StoreHostedImageParams {
  hosting: HostingConfig | null;
  url: string;
  projectId: string;
  label: "source" | "rendered" | string;
  isPublic?: boolean;
}

interface CreateProjectParams {
  item: DesignItem;
  isPublic?: boolean;
  isUpdate?: boolean;
}

interface Generate3DViewParams {
  sourceImage: string;
  projectId?: string | null;
}