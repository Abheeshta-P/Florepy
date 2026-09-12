const PROJECT_PREFIX = "florepy_project_";
const COMMUNITY_PREFIX = "florepy_community_";

const jsonError = (status, message, extra = {}) => {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

const getUserInfo = async (userPuter) => {
  try {
    const user = await userPuter.auth.getUser();

    return {
      uuid: user?.uuid || null,
      username: user?.username || null,
    };
  } catch {
    return { uuid: null, username: null };
  }
};

router.post("/api/projects/save", async ({ request, user }) => {
  try {
    const userPuter = user?.puter;

    if (!userPuter) return jsonError(401, "Authentication failed");

    const body = await request.json();
    const project = body?.project;
    const visibility = body?.visibility || (project?.visibility ? project.visibility : (project?.isPublic ? "public" : "private"));

    if (!project?.id || !project?.sourceImage)
      return jsonError(400, "Project ID and source ID required");

    const userInfo = await getUserInfo(userPuter);

    if (!userInfo.uuid) return jsonError(401, "Authentication failed");

    const payload = {
      ...project,
      ownerId: project.ownerId || userInfo.uuid,
      ownerName: project.ownerName || userInfo.username || "Community Member",
      visibility,
      isPublic: visibility === "public",
      updatedAt: new Date().toISOString(),
    };

    // 1. Save to user's private vault store
    const key = `${PROJECT_PREFIX}${project.id}`;
    await userPuter.kv.set(key, payload);

    // 2. Sync with the global community registry
    const communityKey = `${COMMUNITY_PREFIX}${project.id}`;
    if (payload.isPublic) {
      try {
        await me.puter.kv.set(communityKey, payload);
      } catch (err) {
        console.warn("Failed to set global community key", err);
      }
    } else if (body?.isUpdate) {
      try {
        await me.puter.kv.del(communityKey);
      } catch (err) {
        console.warn("Failed to delete global community key", err);
      }
    }

    return { saved: true, id: project.id, project: payload };
  } catch (e) {
    return jsonError(500, "Failed to save project", {
      message: e.message || "Unknown error",
    });
  }
});

// List personal projects for authenticated user (Dashboard)
router.get("/api/projects/list", async ({ request, user }) => {
  try {
    const userPuter = user?.puter;

    if (!userPuter) return jsonError(401, "Authentication failed");

    const userInfo = await getUserInfo(userPuter);

    if (!userInfo.uuid) return jsonError(401, "Authentication failed");

    const kvItems = await userPuter.kv.list(`${PROJECT_PREFIX}*`, true);
    const projects = Array.isArray(kvItems)
      ? kvItems.map(({ value }) => ({
          ...value,
          ownerName: value?.ownerName,
          isPublic: Boolean(value?.isPublic ?? (value?.visibility === "public")),
          visibility: value?.visibility ?? (value?.isPublic ? "public" : "private"),
        }))
      : [];

    return { projects };
  } catch (e) {
    return jsonError(500, "Failed to list projects", {
      message: e.message || "Unknown error",
    });
  }
});

// List all community projects (Public Feed - accessible to ANY user or guest)
router.get("/api/projects/community", async () => {
  try {
    const kvItems = await me.puter.kv.list(`${COMMUNITY_PREFIX}*`, true);
    const projects = Array.isArray(kvItems)
      ? kvItems.map(({ value }) => ({
          ...value,
          ownerName: value?.ownerName,
          isPublic: true,
          visibility: "public",
        }))
      : [];

    return { projects };
  } catch (e) {
    return jsonError(500, "Failed to list community projects", {
      message: e.message || "Unknown error",
    });
  }
});

// Fetch single project by ID (checks owner personal store first, then falls back to public community store)
router.get("/api/projects/get", async ({ request, user }) => {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) return jsonError(400, "Project ID is required");

    // 1. Try owner's personal store if caller is authenticated
    const userPuter = user?.puter;
    if (userPuter) {
      try {
        const key = `${PROJECT_PREFIX}${id}`;
        const personalProject = await userPuter.kv.get(key);

        if (personalProject) {
          const resolvedProject = {
            ...personalProject,
            isOwner: true,
            isPublic: Boolean(personalProject?.isPublic ?? (personalProject?.visibility === "public")),
            visibility: personalProject?.visibility ?? (personalProject?.isPublic ? "public" : "private"),
          };
          return { project: resolvedProject };
        }
      } catch {
        // Fall through to public check
      }
    }

    // 2. Check global community registry (accessible to other accounts and unauthenticated visitors)
    try {
      const communityKey = `${COMMUNITY_PREFIX}${id}`;
      const publicProject = await me.puter.kv.get(communityKey);

      if (publicProject) {
        let isOwner = false;
        const authorName = publicProject.ownerName;
        if (userPuter) {
          const userInfo = await getUserInfo(userPuter);
          isOwner = Boolean(
            (userInfo?.uuid && publicProject.ownerId && userInfo.uuid === publicProject.ownerId) ||
            (userInfo?.username && authorName && userInfo.username.toLowerCase() === authorName.toLowerCase())
          );
        }
        const resolvedProject = {
          ...publicProject,
          ownerName: authorName,
          isOwner,
          isPublic: true,
          visibility: "public",
        };
        return { project: resolvedProject };
      }
    } catch {
      // Not in community store
    }

    return jsonError(404, "Project not found");
  } catch (e) {
    return jsonError(500, "Failed to fetch project", {
      message: e.message || "Unknown error",
    });
  }
});

// Delete project (removes from personal vault and community registry)
router.post("/api/projects/delete", async ({ request, user }) => {
  try {
    const userPuter = user?.puter;

    if (!userPuter) return jsonError(401, "Authentication failed");

    const userInfo = await getUserInfo(userPuter);
    if (!userInfo.uuid) return jsonError(401, "Authentication failed");

    const body = await request.json();
    const id = body?.id;

    if (!id) return jsonError(400, "Project ID is required");

    // 1. Delete from user's personal KV store
    const personalKey = `${PROJECT_PREFIX}${id}`;
    const personalProject = await userPuter.kv.get(personalKey).catch(() => null);
    await userPuter.kv.del(personalKey).catch(() => {});

    // 2. Delete private files from user's Puter FS
    try {
      await userPuter.fs.delete(`project/${id}`).catch(() => {});
    } catch {}

    // 3. Only delete from global community registry and public hosting if public
    const wasPublic = Boolean(body?.isPublic ?? (personalProject?.isPublic || personalProject?.visibility === "public"));
    if (wasPublic) {
      try {
        await userPuter.fs.delete(`public/project/${id}`).catch(() => {});
      } catch {}

      const communityKey = `${COMMUNITY_PREFIX}${id}`;
      try {
        const publicProject = await me.puter.kv.get(communityKey);
        if (publicProject) {
          const isOwner =
            (userInfo.uuid && publicProject.ownerId && userInfo.uuid === publicProject.ownerId) ||
            (userInfo.username && publicProject.ownerName && userInfo.username.toLowerCase() === publicProject.ownerName.toLowerCase()) ||
            personalProject !== null;

          if (isOwner) {
            await me.puter.kv.del(communityKey);
          }
        }
      } catch (err) {
        console.warn("Failed to delete from community KV:", err);
      }
    }

    return { deleted: true, id };
  } catch (e) {
    return jsonError(500, "Failed to delete project", {
      message: e.message || "Unknown error",
    });
  }
});
