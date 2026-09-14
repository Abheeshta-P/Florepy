import puter from "@heyputer/puter.js";
import {
  getOrCreateHostingConfig,
  uploadImageToHosting,
  PUBLIC_HOSTING_DIR,
} from "./puter.hosting";
import { isHostedUrl, getHostedUrl } from "./utils";
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
 * Executes a call to the Puter worker endpoint with the user's auth token
 * attached via `puter-auth`, WITHOUT triggering Puter's login popup when unauthenticated.
 */
const callWorker = async (url: string, init?: RequestInit): Promise<Response> => {
  const headers = new Headers(init?.headers);
  const token = (puter as any)?.authToken;
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

  const resolvedSource =
    hostedSource?.url ||
    (isHostedUrl(item.sourceImage) ? item.sourceImage : "");

  if (!resolvedSource) {
    console.warn("Failed to host source image, skipping save.");
    return null;
  }

  const resolvedRender =
    hostedRender?.url ||
    (item.renderedImage && isHostedUrl(item.renderedImage)
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

  const payload = {
    ...rest,
    ownerName: authorName,
    ownerId,
    sourceImage: resolvedSource,
    renderedImage: resolvedRender,
    isPublic: standardizedIsPublic,
  };

  try {
    // call puter worker to store the project in kv
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
      console.error("Failed to save the project", await response.text());
      return null;
    }

    const data = (await response.json()) as { project?: DesignItem | null };

    return data?.project ?? null;
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
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  ) {
    return url;
  }

  // It is a private Puter FS path (e.g. project/123/source.png)
  if (typeof window !== "undefined" && (window as any).puter?.fs) {
    try {
      const blob = await (window as any).puter.fs.read(url);
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

    return mapped;
  } catch (error) {
    console.error("Failed to get community projects", error);
    return [];
  }
};

export const getProjectById = async ({ id }: { id: string }) => {
  if (!PUTER_WORKER_URL) {
    console.warn("Missing VITE_PUTER_WORKER_URL; skipping project fetch.");
    return null;
  }

  try {
    const response = await callWorker(
      `${PUTER_WORKER_URL}/api/projects/get?id=${encodeURIComponent(id)}`,
      { method: "GET" },
    );

    if (!response.ok) {
      console.error("Failed to fetch project:", await response.text());
      return null;
    }

    const data = (await response.json()) as {
      project?: DesignItem | null;
    };

    const project = data?.project ?? null;
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
    const hosting = await getOrCreateHostingConfig();
    if (hosting?.subdomain) {
      const publicDir = `${PUBLIC_HOSTING_DIR}/project/${projectId}`;
      await puter.fs.mkdir(publicDir, { createMissingParents: true }).catch(() => {});

      const exts = ["png", "jpg", "jpeg", "webp"];
      for (const ext of exts) {
        try {
          const blob = await puter.fs.read(`project/${projectId}/source.${ext}`);
          if (blob && blob.size > 0) {
            await puter.fs.write(`${publicDir}/source.${ext}`, blob);
            publicSource = getHostedUrl({ subdomain: hosting.subdomain }, `project/${projectId}/source.${ext}`) || publicSource;
            break;
          }
        } catch {}
      }

      for (const ext of exts) {
        try {
          const blob = await puter.fs.read(`project/${projectId}/rendered.${ext}`);
          if (blob && blob.size > 0) {
            await puter.fs.write(`${publicDir}/rendered.${ext}`, blob);
            publicRender = getHostedUrl({ subdomain: hosting.subdomain }, `project/${projectId}/rendered.${ext}`) || publicRender;
            break;
          }
        } catch {}
      }
    }
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
