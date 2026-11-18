import puter from "@heyputer/puter.js";
import {
  getOrCreateHostingConfig,
  uploadImageToHosting,
  PUBLIC_HOSTING_DIR,
} from "./puter.hosting";
import { isHostedUrl, getHostedUrl, isDisplayableUrl } from "./utils";
import { PUTER_WORKER_URL } from "./constants";

export const signIn = async () => await puter.auth.signIn();

export const signOut = () => puter.auth.signOut();

export const getCurrentUser = async () => {
  try {
    if (!puter.auth.isSignedIn()) return null;
    return await puter.auth.getUser();
  } catch {
    return null;
  }
};

/**
 * Retrieves the Puter authentication token from in-memory SDK properties
 * or persistent browser storage (supporting both v2 and legacy v1 tokens).
 * Ensures worker API calls are consistently authenticated.
 */
export const getPuterToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return (
    (puter as any)?.authToken ||
    (puter as any)?.auth?.token ||
    localStorage.getItem("puter.auth.token.v2") ||
    localStorage.getItem("puter.auth.token") ||
    null
  );
};

/**
 * Executes an HTTP call to the Puter worker endpoint with the user's auth token
 * attached via `puter-auth`, WITHOUT triggering Puter's login popup when unauthenticated.
 */
const callWorker = async (url: string, init?: RequestInit): Promise<Response> => {
  const headers = new Headers(init?.headers);
  const token = getPuterToken();
  if (token && !headers.has("puter-auth")) {
    headers.set("puter-auth", token);
  }
  return fetch(url, {
    ...init,
    headers,
  });
};

// ACTIONS FOR WORKERS

// create project and create kv
export const createProject = async ({
  item,
  isPublic = false,
  isUpdate = false,
}: CreateProjectParams): Promise<DesignItem | null | undefined> => {
  if (!PUTER_WORKER_URL) {
    console.warn("Missing VITE_PUTER_WORKER_URL; skipping projects save;");
    return null;
  }

  if (!puter.auth.isSignedIn()) {
    console.error("Authentication required: Cannot create project without signing in.");
    return null;
  }

  // Standardize on isPublic: boolean
  const standardizedIsPublic =
    typeof isPublic === "boolean" ? isPublic : Boolean(item.isPublic);

  const projectId = item.id;

  // Only use public hosting config if project is marked public
  const hosting = standardizedIsPublic ? await getOrCreateHostingConfig() : null;

  // host
  const hostedSource = projectId
    ? await uploadImageToHosting({
        hosting,
        url: item.sourceImage,
        projectId,
        label: "source",
        isPublic: standardizedIsPublic,
      })
    : null;

  const hostedRender =
    projectId && item.renderedImage
      ? await uploadImageToHosting({
          hosting,
          url: item.renderedImage,
          projectId,
          label: "rendered",
          isPublic: standardizedIsPublic,
        })
      : null;

  // Safely resolve the source image path: prefer hosted URL from upload,
  // or retain existing valid private/hosted paths so they are not wiped.
  const resolvedSource =
    hostedSource?.url ||
    (item.sourceImage && (isHostedUrl(item.sourceImage) || item.sourceImage.startsWith("project/"))
      ? item.sourceImage
      : "");

  if (!resolvedSource) {
    console.warn("Failed to host source image, skipping save.");
    return null;
  }

  // Safely resolve rendered view: prefer hosted URL from upload,
  // or retain existing private Puter FS / hosted paths.
  const resolvedRender =
    hostedRender?.url ||
    (item.renderedImage && (isHostedUrl(item.renderedImage) || item.renderedImage.startsWith("project/"))
      ? item.renderedImage
      : undefined);

  const {
    sourcePath: _sourcePath,
    renderedPath: _renderedPath,
    publicPath: _publicPath,
    ...rest
  } = item;

  const currentUser = await getCurrentUser();
  const authorName = item.ownerName || currentUser?.username || undefined;
  const ownerId = item.ownerId || currentUser?.uuid || undefined;

  const payload: DesignItem = {
    ...rest,
    id: projectId,
    ownerName: authorName,
    ownerId,
    sourceImage: resolvedSource,
    renderedImage: resolvedRender,
    isPublic: standardizedIsPublic,
    timestamp: item.timestamp || Date.now(),
  };

  try {
    // 1. Direct local KV save for instant high-reliability persistence
    const key = `florepy_project_${projectId}`;
    try {
      const existing = await puter.kv.get(key);
      const existingRecord = typeof existing === "string" ? JSON.parse(existing) : existing;
      await puter.kv.set(key, { ...(existingRecord || {}), ...payload });
    } catch (kvErr) {
      console.warn("Direct browser KV save error:", kvErr);
    }

    // 2. Call puter worker to store the project in central kv & community
    const response = await callWorker(
      `${PUTER_WORKER_URL}/api/projects/save`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project: payload,
          isPublic: standardizedIsPublic,
          isUpdate,
        }),
      },
    );

    if (!response.ok) {
      console.error("Worker failed to save the project", await response.text());
      const sourceDisplay = (await resolveDisplayUrl(payload.sourceImage)) || payload.sourceImage;
      const renderDisplay = (await resolveDisplayUrl(payload.renderedImage)) || payload.renderedImage;
      return {
        ...payload,
        sourceImage: sourceDisplay,
        renderedImage: renderDisplay,
      };
    }

    const data = (await response.json()) as { project?: DesignItem | null };
    const savedProject = data?.project ?? payload;

    // Resolve private paths to displayable blob URLs
    const sourceDisplay = (await resolveDisplayUrl(savedProject.sourceImage)) || savedProject.sourceImage;
    const renderDisplay = (await resolveDisplayUrl(savedProject.renderedImage)) || savedProject.renderedImage;

    // If Puter FS path was returned without being resolved, preserve in-memory working URLs if available
    const finalSource =
      isDisplayableUrl(sourceDisplay)
        ? sourceDisplay
        : (isDisplayableUrl(item.sourceImage) ? item.sourceImage : sourceDisplay);

    const finalRender =
      isDisplayableUrl(renderDisplay)
        ? renderDisplay
        : (isDisplayableUrl(item.renderedImage) ? item.renderedImage : renderDisplay);

    return {
      ...savedProject,
      sourceImage: finalSource,
      renderedImage: finalRender,
    };
  } catch (error) {
    console.error("Failed to save project", error);
    return null;
  }
};

// Helper to resolve private filesystem paths into displayable local blob URLs
export const resolveDisplayUrl = async (
  url: string | null | undefined
): Promise<string | null> => {
  if (!url) return null;
  if (isDisplayableUrl(url)) {
    return url;
  }

  // It is a private Puter FS path (e.g. project/123/source.png)
  const puterFs = (typeof window !== "undefined" && (window as any).puter?.fs) || puter?.fs;
  if (puterFs) {
    try {
      const blob = await puterFs.read(url);
      if (blob && blob.size > 0) {
        return URL.createObjectURL(blob);
      }
    } catch (err) {
      console.warn("Could not load private Puter FS file:", url, err);
    }
  }

  return url;
};

// from BE/worker in puter
export const getProjects = async () => {
  if (!PUTER_WORKER_URL) {
    console.warn("Missing VITE_PUTER_WORKER_URL; skip history fetch;");
    return [];
  }

  try {
    const response = await callWorker(
      `${PUTER_WORKER_URL}/api/projects/list`,
      { method: "GET" },
    );

    if (!response.ok) {
      console.error("Failed to fetch history", await response.text());
      return [];
    }

    const data = (await response.json()) as { projects?: DesignItem[] | null };
    const rawProjects = Array.isArray(data?.projects) ? data.projects : [];

    const mapped = await Promise.all(
      rawProjects.map(async (p) => {
        const sourceImage = (await resolveDisplayUrl(p.sourceImage)) || p.sourceImage;
        const renderedImage = (await resolveDisplayUrl(p.renderedImage)) || p.renderedImage;
        return {
          ...p,
          sourceImage,
          renderedImage,
        };
      })
    );

    return mapped;
  } catch (error) {
    console.error("Failed to get projects", error);
    return [];
  }
};

// Fetch shared community projects (Public Feed - accessible to ANY user and guests)
export const getCommunityProjects = async (): Promise<DesignItem[]> => {
  if (!PUTER_WORKER_URL) {
    console.warn("Missing VITE_PUTER_WORKER_URL; skipping community fetch;");
    return [];
  }

  try {
    const response = await callWorker(
      `${PUTER_WORKER_URL}/api/projects/community`,
      { method: "GET" }
    );

    if (!response.ok) {
      console.error("Failed to fetch community projects", await response.text());
      return [];
    }

    const data = (await response.json()) as { projects?: DesignItem[] | null };
    const rawProjects = Array.isArray(data?.projects) ? data.projects : [];

    const mapped = await Promise.all(
      rawProjects.map(async (p) => {
        const sourceImage = (await resolveDisplayUrl(p.sourceImage)) || p.sourceImage;
        const renderedImage = (await resolveDisplayUrl(p.renderedImage)) || p.renderedImage;
        return {
          ...p,
          sourceImage,
          renderedImage,
        };
      })
    );

    return mapped.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch (error) {
    console.error("Failed to get community projects", error);
    return [];
  }
};

export const getProjectById = async ({
  id,
  reviewToken,
}: {
  id: string;
  reviewToken?: string | null;
}) => {
  if (!PUTER_WORKER_URL) {
    console.warn("Missing VITE_PUTER_WORKER_URL; skipping project fetch.");
    return null;
  }

  try {
    const query = new URLSearchParams({ id });
    if (reviewToken) {
      query.set("review", reviewToken);
    }

    const response = await callWorker(
      `${PUTER_WORKER_URL}/api/projects/get?${query.toString()}`,
      { method: "GET" },
    );

    let project: DesignItem | null = null;

    if (response.ok) {
      const data = (await response.json()) as {
        project?: DesignItem | null;
      };
      project = data?.project ?? null;
    }

    // Direct browser KV fallback: if worker is unreachable or hasn't finished syncing,
    // load directly from the authenticated user's local Puter KV store so the visualizer never fails.
    if (!project && puter.auth.isSignedIn()) {
      try {
        const localRecord = await puter.kv.get(`florepy_project_${id}`);
        if (localRecord) {
          const parsed = typeof localRecord === "string" ? JSON.parse(localRecord) : localRecord;
          if (parsed && parsed.id) {
            project = {
              ...parsed,
              isOwner: true,
              isPublic: Boolean(parsed.isPublic),
            };
          }
        }
      } catch (localErr) {
        console.warn("Local KV fallback check:", localErr);
      }
    }

    if (!project) return null;

    const sourceImage = (await resolveDisplayUrl(project.sourceImage)) || project.sourceImage;
    const renderedImage = (await resolveDisplayUrl(project.renderedImage)) || project.renderedImage;

    return {
      ...project,
      sourceImage,
      renderedImage,
    };
  } catch (error) {
    console.error("Failed to fetch project:", error);
    return null;
  }
};

/**
 * Copies source and rendered project files from the private vault
 * into the public hosting directory so external visitors and clients can view them.
 */
export const copyProjectFilesToPublicHosting = async (
  projectId: string
): Promise<{ sourceImage?: string; renderedImage?: string }> => {
  if (!projectId) return {};
  try {
    const hosting = await getOrCreateHostingConfig();
    if (!hosting?.subdomain) return {};

    const publicDir = `${PUBLIC_HOSTING_DIR}/project/${projectId}`;
    await puter.fs.mkdir(publicDir, { createMissingParents: true }).catch(() => {});

    let publicSource: string | undefined;
    let publicRender: string | undefined;

    const exts = ["png", "jpg", "jpeg", "webp", "svg"];
    for (const ext of exts) {
      try {
        const blob = await puter.fs.read(`project/${projectId}/source.${ext}`);
        if (blob && blob.size > 0) {
          await puter.fs.write(`${publicDir}/source.${ext}`, blob);
          publicSource =
            getHostedUrl(
              { subdomain: hosting.subdomain },
              `project/${projectId}/source.${ext}`
            ) || undefined;
          break;
        }
      } catch {}
    }

    for (const ext of exts) {
      try {
        const blob = await puter.fs.read(`project/${projectId}/rendered.${ext}`);
        if (blob && blob.size > 0) {
          await puter.fs.write(`${publicDir}/rendered.${ext}`, blob);
          publicRender =
            getHostedUrl(
              { subdomain: hosting.subdomain },
              `project/${projectId}/rendered.${ext}`
            ) || undefined;
          break;
        }
      } catch {}
    }

    return { sourceImage: publicSource, renderedImage: publicRender };
  } catch (err) {
    console.warn("Failed to copy project files to public hosting:", err);
    return {};
  }
};

export const toggleProjectPublic = async ({
  project,
  isPublic,
}: {
  project: DesignItem;
  isPublic: boolean;
}): Promise<DesignItem | null> => {
  if (!project?.id) return null;

  const projectId = project.id;

  let publicSource = project.sourceImage;
  let publicRender = project.renderedImage;

  if (isPublic) {
    // 1. PUBLISH: Copy files from private vault into public/project/{projectId}/
    const hosted = await copyProjectFilesToPublicHosting(projectId);
    publicSource = hosted.sourceImage || publicSource;
    publicRender = hosted.renderedImage || publicRender;
  } else {
    // 2. UNPUBLISH: Delete files from public hosting directory
    await puter.fs.delete(`${PUBLIC_HOSTING_DIR}/project/${projectId}`).catch(() => {});
    publicSource = `project/${projectId}/source.png`;
    publicRender = project.renderedImage ? `project/${projectId}/rendered.png` : undefined;
  }

  const currentUser = await getCurrentUser();
  const ownerId = project.ownerId || currentUser?.uuid || undefined;
  const ownerName = project.ownerName || currentUser?.username || undefined;

  const updatedItem: DesignItem = {
    ...project,
    ownerId,
    ownerName,
    isPublic,
    sourceImage: publicSource,
    renderedImage: publicRender,
  };

  // 1. Direct KV update on user's puter to ensure immediate consistency
  try {
    const key = `florepy_project_${project.id}`;
    const existing = await puter.kv.get(key).catch(() => null);
    const merged = typeof existing === "object" && existing !== null
      ? { ...existing, ...updatedItem }
      : updatedItem;
    await puter.kv.set(key, merged).catch(() => null);
  } catch (err) {
    console.warn("Direct KV update:", err);
  }

  // 2. Call createProject (which passes payload to worker and syncs hosting)
  const saved = await createProject({
    item: updatedItem,
    isPublic,
    isUpdate: true,
  });

  const displaySource = (await resolveDisplayUrl(updatedItem.sourceImage)) || updatedItem.sourceImage;
  const displayRender = (await resolveDisplayUrl(updatedItem.renderedImage)) || updatedItem.renderedImage;

  return {
    ...(saved ?? updatedItem),
    isPublic,
    sourceImage: displaySource,
    renderedImage: displayRender,
  };
};

/**
 * Auto-heals any public projects in the authenticated user's store that might have failed
 * to sync to the global community registry (e.g. network hiccup, prior worker sync error).
 */
export const syncMissingPublicProjects = async (): Promise<void> => {
  try {
    if (!PUTER_WORKER_URL || !puter.auth.isSignedIn()) return;

    // Fetch user's personal projects
    const personal = await getProjects();
    const publicPersonal = personal.filter((p) => Boolean(p.isPublic));
    if (publicPersonal.length === 0) return;

    // Fetch current community registry list
    const response = await callWorker(
      `${PUTER_WORKER_URL}/api/projects/community`,
      { method: "GET" }
    );
    if (!response.ok) return;

    const data = (await response.json()) as { projects?: DesignItem[] | null };
    const communityList = Array.isArray(data?.projects) ? data.projects : [];
    const communityIds = new Set(communityList.map((c) => c.id));

    // Identify and sync any personal public projects missing from the community registry
    for (const proj of publicPersonal) {
      if (!communityIds.has(proj.id)) {
        await toggleProjectPublic({ project: proj, isPublic: true });
      }
    }
  } catch (err) {
    console.warn("Syncing public projects:", err);
  }
};

export const deleteProject = async ({
  id,
  isPublic,
}: {
  id: string;
  isPublic?: boolean;
}): Promise<boolean> => {
  if (!id || !PUTER_WORKER_URL) return false;

  try {
    const response = await callWorker(
      `${PUTER_WORKER_URL}/api/projects/delete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, isPublic }),
      }
    );

    if (!response.ok) {
      console.error("Failed to delete project on worker:", await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error("Worker error during delete:", error);
    return false;
  }
};

export const renameProject = async ({
  project,
  name,
}: {
  project: DesignItem;
  name: string;
}): Promise<DesignItem | null> => {
  if (!project?.id || !name.trim()) return null;
  const trimmedName = name.trim();
  const id = project.id;

  try {
    // 1. Direct KV update for instant local consistency
    const key = `florepy_project_${id}`;
    const existing = await puter.kv.get(key).catch(() => null);
    const existingRecord = (typeof existing === "object" && existing !== null ? existing : {}) as Partial<DesignItem>;

    const updated: DesignItem = {
      ...project,
      ...existingRecord,
      id: project.id,
      name: trimmedName,
      sourceImage: existingRecord.sourceImage || project.sourceImage,
      timestamp: existingRecord.timestamp || project.timestamp,
      isPublic: Boolean(existingRecord.isPublic ?? project.isPublic),
    };

    await puter.kv.set(key, updated).catch(() => null);

    // 2. Sync with worker (which updates user store and community registry if public)
    if (PUTER_WORKER_URL) {
      await callWorker(`${PUTER_WORKER_URL}/api/projects/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project: updated,
          isPublic: Boolean(updated.isPublic),
          isUpdate: true,
        }),
      }).catch(() => null);
    }

    return {
      ...project,
      name: trimmedName,
    };
  } catch (error) {
    console.error("Failed to rename project:", error);
    return null;
  }
};

/**
 * Ensures images for client review are hosted on the owner's hosting subdomain
 * so that invited clients can view the design without needing owner filesystem credentials.
 */
export const ensureHostedReviewImages = async (
  project: DesignItem
): Promise<{ sourceImage?: string; renderedImage?: string | null }> => {
  if (!project?.id) return {};

  // If already hosted URLs, skip expensive filesystem re-copying
  if (
    isHostedUrl(project.sourceImage) &&
    (!project.renderedImage || isHostedUrl(project.renderedImage))
  ) {
    return {
      sourceImage: project.sourceImage,
      renderedImage: project.renderedImage,
    };
  }

  const hosted = await copyProjectFilesToPublicHosting(project.id);
  return {
    sourceImage: hosted.sourceImage || project.sourceImage,
    renderedImage: hosted.renderedImage !== undefined ? hosted.renderedImage : project.renderedImage,
  };
};

/**
 * Updates review settings (token, passcode, reviews) for a project.
 * Uses the Worker review endpoint as the single source of truth to avoid
 * race conditions or overwriting client reviews with stale local state.
 */
export const updateProjectReviews = async ({
  projectId,
  reviewToken,
  reviewPasscode,
  reviews,
  action = "sync",
  review,
  reviewId,
  resolved,
  sourceImage,
  renderedImage,
  text,
  author,
}: {
  projectId: string;
  reviewToken?: string | null;
  reviewPasscode?: string | null;
  reviews?: ProjectReview[];
  action?: "sync" | "add" | "resolve" | "delete" | "edit";
  review?: ProjectReview;
  reviewId?: string;
  resolved?: boolean;
  sourceImage?: string;
  renderedImage?: string | null;
  text?: string;
  author?: string;
}): Promise<boolean> => {
  if (!projectId) return false;

  try {
    // Call Worker review endpoint (single authoritative store for both owner and clients)
    if (PUTER_WORKER_URL) {
      const res = await callWorker(`${PUTER_WORKER_URL}/api/projects/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          reviewToken,
          reviewPasscode,
          reviews,
          action,
          review,
          reviewId,
          resolved,
          sourceImage,
          renderedImage,
          text,
          author,
        }),
      }).catch(() => null);

      if (res && res.ok) {
        return true;
      }
    }

    return true;
  } catch (err) {
    console.error("Failed to update project reviews:", err);
    return false;
  }
};
