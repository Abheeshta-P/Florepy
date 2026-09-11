import puter from "@heyputer/puter.js";
import {
  getOrCreateHostingConfig,
  uploadImageToHosting,
} from "./puter.hosting";
import { isHostedUrl, HOSTING_DOMAIN_SUFFIX } from "./utils";
import { PUTER_WORKER_URL } from "./constants";

export const signIn = async () => await puter.auth.signIn();

export const signOut = () => puter.auth.signOut();

export const getCurrentUser = async () => {
  try {
    return await puter.auth.getUser();
  } catch {
    return null;
  }
};

// ACTIONS FOR WORKERS

// create project and create kv
export const createProject = async ({
  item,
  visibility = "private",
}: CreateProjectParams): Promise<DesignItem | null | undefined> => {
  if (!PUTER_WORKER_URL) {
    console.warn("Missing VITE_PUTER_WORKER_URL; skipping projects save;");
    return null;
  }

  const projectId = item.id;

  // Always use hosting config so image URLs are permanent and never expire with token errors
  const hosting = await getOrCreateHostingConfig();

  // host
  const hostedSource = projectId
    ? await uploadImageToHosting({
        hosting,
        url: item.sourceImage,
        projectId,
        label: "source",
        visibility,
      })
    : null;

  const hostedRender =
    projectId && item.renderedImage
      ? await uploadImageToHosting({
          hosting,
          url: item.renderedImage,
          projectId,
          label: "rendered",
          visibility,
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

  const payload = {
    ...rest,
    sourceImage: resolvedSource,
    renderedImage: resolvedRender,
    visibility,
    isPublic: visibility === "public",
  };

  try {
    // call puter worker to store the project in kv
    const response = await puter.workers.exec(
      `${PUTER_WORKER_URL}/api/projects/save`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project: payload,
          visibility,
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

// Helper to heal old/expiring Puter read URLs into permanent hosted URLs
export const healImageUrl = async (
  url: string | null | undefined,
  projectId: string,
  label: "source" | "rendered",
  subdomain?: string | null
): Promise<string | undefined> => {
  if (!url) return undefined;
  if (isHostedUrl(url)) return url;

  // 1. If subdomain is available, use the permanent hosted URL
  if (subdomain) {
    const extMatch = url.match(/\.(png|jpe?g|webp|svg)/i);
    const ext = extMatch ? extMatch[1] : "png";
    return `https://${subdomain}${HOSTING_DOMAIN_SUFFIX}/project/${projectId}/${label}.${ext}`;
  }

  // 2. If it's an expiring Puter read URL, try refreshing with puter.fs.getReadURL if on client
  if (url.includes("api.puter.com") || url.includes("token=")) {
    if (typeof window !== "undefined") {
      try {
        const extMatch = url.match(/\.(png|jpe?g|webp|svg)/i);
        const ext = extMatch ? extMatch[1] : "png";
        const fresh = await puter.fs.getReadURL(`project/${projectId}/${label}.${ext}`).catch(() => null);
        if (fresh) return fresh;
      } catch {
        // fallback to original
      }
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
    const response = await puter.workers.exec(
      `${PUTER_WORKER_URL}/api/projects/list`,
      { method: "GET" },
    );

    if (!response.ok) {
      console.error("Failed to fetch history", await response.text());
      return [];
    }

    const data = (await response.json()) as { projects?: DesignItem[] | null };
    const rawProjects = Array.isArray(data?.projects) ? data.projects : [];

    const hostingConfig = await getOrCreateHostingConfig().catch(() => null);

    const mapped = await Promise.all(
      rawProjects.map(async (p) => {
        const isPublic = p.visibility ? p.visibility === "public" : (Boolean(p.isPublic) && p.visibility !== "private");
        const sourceImage = (await healImageUrl(p.sourceImage, p.id, "source", hostingConfig?.subdomain)) || p.sourceImage;
        const renderedImage = (await healImageUrl(p.renderedImage, p.id, "rendered", hostingConfig?.subdomain)) || p.renderedImage;

        return {
          ...p,
          isPublic,
          visibility: (isPublic ? "public" : "private") as "public" | "private",
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

export const getProjectById = async ({ id }: { id: string }) => {
  if (!PUTER_WORKER_URL) {
    console.warn("Missing VITE_PUTER_WORKER_URL; skipping project fetch.");
    return null;
  }

  console.log("Fetching project with ID:", id);

  try {
    const response = await puter.workers.exec(
      `${PUTER_WORKER_URL}/api/projects/get?id=${encodeURIComponent(id)}`,
      { method: "GET" },
    );

    console.log("Fetch project response:", response);

    if (!response.ok) {
      console.error("Failed to fetch project:", await response.text());
      return null;
    }

    const data = (await response.json()) as {
      project?: DesignItem | null;
    };

    console.log("Fetched project data:", data);

    const project = data?.project ?? null;
    if (!project) return null;

    const hostingConfig = await getOrCreateHostingConfig().catch(() => null);
    const isPublic = project.visibility ? project.visibility === "public" : (Boolean(project.isPublic) && project.visibility !== "private");

    const sourceImage = (await healImageUrl(project.sourceImage, project.id, "source", hostingConfig?.subdomain)) || project.sourceImage;
    const renderedImage = (await healImageUrl(project.renderedImage, project.id, "rendered", hostingConfig?.subdomain)) || project.renderedImage;

    return {
      ...project,
      isPublic,
      visibility: (isPublic ? "public" : "private") as "public" | "private",
      sourceImage,
      renderedImage,
    };
  } catch (error) {
    console.error("Failed to fetch project:", error);
    return null;
  }
};

export const toggleProjectVisibility = async ({
  project,
  isPublic,
}: {
  project: DesignItem;
  isPublic: boolean;
}): Promise<DesignItem | null> => {
  if (!project?.id) return null;

  const visibility = isPublic ? "public" : "private";
  const updatedItem: DesignItem = {
    ...project,
    isPublic,
    visibility,
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
    visibility,
  });

  return saved ?? updatedItem;
};
