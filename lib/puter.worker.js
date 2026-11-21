const PROJECT_PREFIX = "florepy_project_";
const COMMUNITY_PREFIX = "florepy_community_";
const REVIEW_PREFIX = "florepy_review_";

const DEFAULT_MAX_VERSIONS = 5;
const DEFAULT_RETENTION_DAYS = 30;

/**
 * Enforces version retention by:
 * 1. Always protecting Version 1 (the initial original baseline layout).
 * 2. Always protecting the active working version and latest version.
 * 3. Auto-deleting in-between intermediate versions if they have been inactive for > retentionDays (default: 30 days).
 * 4. Capping remaining intermediate versions to fit within maxVersions.
 *
 * @param {Array} versions - List of project versions
 * @param {string} [activeVersionId] - Currently active version ID
 * @param {number} [maxVersions] - Maximum total versions to keep (default: 5)
 * @param {number} [retentionDays] - Inactivity retention days for intermediate versions (default: 30)
 * @returns {Array} Sorted versions array adhering to retention rules
 */
function pruneVersions(
  versions,
  activeVersionId,
  maxVersions = DEFAULT_MAX_VERSIONS,
  retentionDays = DEFAULT_RETENTION_DAYS
) {
  if (!Array.isArray(versions) || versions.length === 0) return versions || [];

  const now = Date.now();
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;

  // Sort descending: newest first
  const sorted = [...versions].sort(
    (a, b) => (b.versionNumber || 0) - (a.versionNumber || 0)
  );

  const v1 = sorted.find((v) => v.versionNumber === 1);
  const latest = sorted[0];
  const active = sorted.find((v) => v.id === activeVersionId) || latest;

  // In-between versions (neither Version 1, nor latest, nor currently active)
  const intermediates = sorted.filter(
    (v) => v.versionNumber !== 1 && v.id !== active.id && v.id !== latest.id
  );

  // 1. Auto-delete intermediate versions that have been inactive for > retentionDays
  const activeIntermediates = intermediates.filter(
    (v) => now - (v.timestamp || 0) <= maxAgeMs
  );

  // 2. Identify all protected versions (unique set of V1, latest, active)
  const protectedVersions = Array.from(new Set([v1, latest, active].filter(Boolean)));

  // 3. Cap total versions to maxVersions by selecting the newest surviving intermediate versions
  const allowedIntermediates = Math.max(0, maxVersions - protectedVersions.length);
  const cappedIntermediates = activeIntermediates.slice(0, allowedIntermediates);

  return Array.from(new Set([...protectedVersions, ...cappedIntermediates])).sort(
    (a, b) => (b.versionNumber || 0) - (a.versionNumber || 0)
  );
}

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
    const isPublic = Boolean(body?.isPublic ?? project?.isPublic);

    if (!project?.id || !project?.sourceImage)
      return jsonError(400, "Project ID and source ID required");

    const userInfo = await getUserInfo(userPuter);

    if (!userInfo.uuid) return jsonError(401, "Authentication failed");

    // Retrieve any existing record so partial updates (e.g., saving an AI 3D render,
    // or toggling visibility) do not inadvertently erase reviews, tokens, or passcodes.
    const key = `${PROJECT_PREFIX}${project.id}`;
    let existingProject = null;
    try {
      const rawExisting = await userPuter.kv.get(key);
      if (rawExisting) {
        existingProject = typeof rawExisting === "string" ? JSON.parse(rawExisting) : rawExisting;
      }
    } catch {}

    // Merge incoming project data with existing record to guarantee data persistence
    const payload = {
      ...(existingProject || {}),
      ...project,
      ownerId: project.ownerId || existingProject?.ownerId || userInfo.uuid,
      ownerName: project.ownerName || existingProject?.ownerName || userInfo.username || "Community Member",
      sourceImage: project.sourceImage || existingProject?.sourceImage,
      renderedImage: project.renderedImage !== undefined ? project.renderedImage : existingProject?.renderedImage,
      reviewToken: project.reviewToken || existingProject?.reviewToken || null,
      reviewPasscode: project.reviewPasscode !== undefined ? project.reviewPasscode : (existingProject?.reviewPasscode || null),
      reviews: Array.isArray(project.reviews) ? project.reviews : (existingProject?.reviews || []),
      activeVersionId: project.activeVersionId || existingProject?.activeVersionId || null,
      versions: project.versions || existingProject?.versions || [],
      isPublic,
      updatedAt: new Date().toISOString(),
    };

    // 1. Save merged record to user's private KV store
    await userPuter.kv.set(key, payload);

    // 2. Sync with the global community registry if public (strictly latest version, no internal versions or reviews)
    const communityKey = `${COMMUNITY_PREFIX}${project.id}`;
    if (payload.isPublic) {
      try {
        const {
          versions: _v,
          reviews: _r,
          reviewToken: _rt,
          reviewPasscode: _rp,
          ...communityPayload
        } = payload;
        await me.puter.kv.set(communityKey, { ...communityPayload, isPublic: true });
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

    // 3. Keep worker review store in sync for client review links (?review=token)
    const targetReviewToken = payload.reviewToken;
    if (targetReviewToken) {
      try {
        const reviewIndexKey = `${REVIEW_PREFIX}${project.id}`;
        const rawExistingReview = await me.puter.kv.get(reviewIndexKey);
        const existingReview = rawExistingReview
          ? (typeof rawExistingReview === "string" ? JSON.parse(rawExistingReview) : rawExistingReview)
          : {};

        await me.puter.kv.set(reviewIndexKey, {
          id: project.id,
          ownerId: payload.ownerId,
          ownerName: payload.ownerName,
          name: payload.name,
          sourceImage: payload.sourceImage,
          renderedImage: payload.renderedImage,
          timestamp: payload.timestamp,
          reviewToken: targetReviewToken,
          reviewPasscode: payload.reviewPasscode !== undefined ? payload.reviewPasscode : (existingReview.reviewPasscode || null),
          reviews: existingReview.reviews || payload.reviews || [],
          activeVersionId: payload.activeVersionId,
          versions: payload.versions,
        });
      } catch (err) {
        console.warn("Failed to set worker review index", err);
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
    const rawProjects = Array.isArray(kvItems)
      ? kvItems
          .map(({ value }) => {
            const item = typeof value === "string" ? JSON.parse(value) : value;
            return {
              ...item,
              ownerName: item?.ownerName,
              isPublic: Boolean(item?.isPublic),
            };
          })
          .filter((p) => p && p.id)
      : [];

    const projects = await Promise.all(
      rawProjects.map(async (p) => {
        try {
          const rawReview = await me.puter.kv.get(`${REVIEW_PREFIX}${p.id}`);
          if (rawReview) {
            const reviewRecord =
              typeof rawReview === "string" ? JSON.parse(rawReview) : rawReview;
            return {
              ...p,
              reviewToken: reviewRecord?.reviewToken || p.reviewToken,
              reviewPasscode: reviewRecord?.reviewPasscode ?? p.reviewPasscode,
              reviews: reviewRecord?.reviews || p.reviews || [],
            };
          }
        } catch {}
        return p;
      })
    );

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
      ? kvItems.map(({ value }) => {
          const item = typeof value === "string" ? JSON.parse(value) : value;
          return {
            ...item,
            ownerName: item?.ownerName,
            isPublic: true,
          };
        })
      : [];

    return { projects };
  } catch (e) {
    return jsonError(500, "Failed to list community projects", {
      message: e.message || "Unknown error",
    });
  }
});

// Fetch single project by ID (checks owner personal store first, then client review store, then falls back to public community store)
router.get("/api/projects/get", async ({ request, user }) => {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const reviewToken = url.searchParams.get("review");

    if (!id) return jsonError(400, "Project ID is required");

    const userPuter = user?.puter;

    // 1. Try owner's personal store if caller is authenticated
    if (userPuter) {
      try {
        const key = `${PROJECT_PREFIX}${id}`;
        const rawPersonal = await userPuter.kv.get(key);

        if (rawPersonal) {
          const personalProject =
            typeof rawPersonal === "string"
              ? JSON.parse(rawPersonal)
              : rawPersonal;

          try {
            const rawReview = await me.puter.kv.get(`${REVIEW_PREFIX}${id}`);
            if (rawReview) {
              const reviewRecord =
                typeof rawReview === "string" ? JSON.parse(rawReview) : rawReview;
              personalProject.reviewToken = reviewRecord?.reviewToken || personalProject.reviewToken;
              personalProject.reviewPasscode = reviewRecord?.reviewPasscode ?? personalProject.reviewPasscode;
              personalProject.reviews = reviewRecord?.reviews || personalProject.reviews || [];
              if (reviewRecord?.versions) personalProject.versions = reviewRecord.versions;
              if (reviewRecord?.activeVersionId) personalProject.activeVersionId = reviewRecord.activeVersionId;
            }
          } catch {}

          const resolvedProject = {
            ...personalProject,
            isOwner: true,
            isPublic: Boolean(personalProject?.isPublic),
          };
          return { project: resolvedProject };
        }
      } catch {
        // Fall through
      }
    }

    // 2. Check client review store FIRST when secret review token is provided
    if (reviewToken) {
      try {
        const reviewKey = `${REVIEW_PREFIX}${id}`;
        const rawReview = await me.puter.kv.get(reviewKey);
        if (rawReview) {
          const reviewProject =
            typeof rawReview === "string" ? JSON.parse(rawReview) : rawReview;

          if (reviewProject?.reviewToken === reviewToken) {
            // Client Review Mode:
            // 1. Client always reviews the latest proposed version (versions[0]).
            // 2. Hide builder versioning controls (versions: undefined) so clients focus strictly on the current design.
            const versions = Array.isArray(reviewProject.versions) ? reviewProject.versions : [];
            const latestVer = versions[0];

            const currentSource = latestVer?.sourceImage || reviewProject.sourceImage;
            const currentRender =
              latestVer?.renderedImage !== undefined
                ? latestVer.renderedImage
                : reviewProject.renderedImage;
            const currentReviews = latestVer?.reviews || reviewProject.reviews || [];

            return {
              project: {
                ...reviewProject,
                sourceImage: currentSource,
                renderedImage: currentRender,
                reviews: currentReviews,
                activeVersionId: latestVer?.id || reviewProject.activeVersionId,
                versions: undefined, // Versioning is builder-only
                isReviewMode: true,
                isOwner: false,
                isPublic: false,
              },
            };
          }
        }
      } catch {
        // Fall through
      }
    }

    // 3. Check global community registry (strictly latest version, no internal versions or reviews)
    try {
      const communityKey = `${COMMUNITY_PREFIX}${id}`;
      const rawPublic = await me.puter.kv.get(communityKey);

      if (rawPublic) {
        const publicProject =
          typeof rawPublic === "string" ? JSON.parse(rawPublic) : rawPublic;
        let isOwner = false;
        const authorName = publicProject?.ownerName;
        if (userPuter) {
          const userInfo = await getUserInfo(userPuter);
          isOwner = Boolean(
            (userInfo?.uuid &&
              publicProject?.ownerId &&
              userInfo.uuid === publicProject.ownerId) ||
              (userInfo?.username &&
                authorName &&
                userInfo.username.toLowerCase() === authorName.toLowerCase())
          );
        }

        // If client provided a valid review token matching the project, include reviews!
        let reviewsToInclude = undefined;
        let isReviewMode = false;

        if (reviewToken && publicProject?.reviewToken === reviewToken) {
          isReviewMode = true;
          try {
            const rawReview = await me.puter.kv.get(`${REVIEW_PREFIX}${id}`);
            const reviewRecord = rawReview
              ? (typeof rawReview === "string" ? JSON.parse(rawReview) : rawReview)
              : null;
            reviewsToInclude = reviewRecord?.reviews || publicProject.reviews || [];
          } catch {
            reviewsToInclude = publicProject.reviews || [];
          }
        }

        const resolvedProject = {
          ...publicProject,
          ownerName: authorName,
          isOwner,
          isPublic: true,
          isReviewMode,
          reviews: reviewsToInclude,
          versions: isOwner ? publicProject.versions : undefined,
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
    const wasPublic = Boolean(body?.isPublic ?? personalProject?.isPublic);
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

    // 4. Delete review index
    try {
      await me.puter.kv.del(`${REVIEW_PREFIX}${id}`);
    } catch {}

    return { deleted: true, id };
  } catch (e) {
    return jsonError(500, "Failed to delete project", {
      message: e.message || "Unknown error",
    });
  }
});

// Review management endpoint (supports unauthenticated clients with reviewToken, and authenticated owners)
router.post("/api/projects/review", async ({ request, user }) => {
  try {
    const body = await request.json();
    const { projectId, reviewToken, action } = body;

    if (!projectId) return jsonError(400, "Project ID is required");

    const reviewKey = `${REVIEW_PREFIX}${projectId}`;
    const rawReview = await me.puter.kv.get(reviewKey);

    const userPuter = user?.puter;
    let reviewRecord = null;

    if (rawReview) {
      reviewRecord =
        typeof rawReview === "string" ? JSON.parse(rawReview) : rawReview;
    } else if (userPuter) {
      // Only the authenticated owner can initialize a new review session from their personal vault
      const personalKey = `${PROJECT_PREFIX}${projectId}`;
      const rawPersonal = await userPuter.kv.get(personalKey);
      if (rawPersonal) {
        const p = typeof rawPersonal === "string" ? JSON.parse(rawPersonal) : rawPersonal;
        reviewRecord = {
          id: p.id,
          ownerId: p.ownerId,
          ownerName: p.ownerName,
          name: p.name,
          sourceImage: p.sourceImage,
          renderedImage: p.renderedImage,
          timestamp: p.timestamp,
          reviewToken: body.reviewToken || p.reviewToken || null,
          reviewPasscode: body.reviewPasscode || p.reviewPasscode || null,
          reviews: p.reviews || [],
        };
      }
    }

    // If no review record exists and caller is not the owner, reject immediately.
    // Public community projects cannot have unauthenticated/arbitrary review sessions created.
    if (!reviewRecord) return jsonError(404, "Project review not found");

    // Check authorization:
    let isOwner = false;
    if (userPuter) {
      try {
        const userInfo = await getUserInfo(userPuter);
        isOwner = Boolean(
          (userInfo?.uuid && reviewRecord.ownerId && userInfo.uuid === reviewRecord.ownerId) ||
          (userInfo?.username && reviewRecord.ownerName && userInfo.username.toLowerCase() === reviewRecord.ownerName.toLowerCase())
        );
      } catch {}
    }

    const isValidClient = Boolean(
      reviewToken && reviewRecord.reviewToken && reviewToken === reviewRecord.reviewToken
    );

    if (!isOwner && !isValidClient) {
      return jsonError(403, "Unauthorized to review this project");
    }

    // Find target version if versions array exists
    const targetVersionId = body.versionId || reviewRecord.activeVersionId;
    // Identify target reviews list: attach directly to active version if present, else fallback to root reviews
    let targetVer = null;
    if (Array.isArray(reviewRecord.versions) && reviewRecord.versions.length > 0) {
      targetVer =
        reviewRecord.versions.find((v) => v.id === targetVersionId) ||
        reviewRecord.versions[0];
      targetVer.reviews = Array.isArray(targetVer.reviews) ? targetVer.reviews : [];
    }

    // Note: for backward compatibility with projects created before versioning, fallback to root reviews if versions array is absent
    let currentReviews = targetVer
      ? (Array.isArray(targetVer.reviews) ? targetVer.reviews : [])
      : (Array.isArray(reviewRecord.reviews) ? reviewRecord.reviews : []);

    if (action === "add") {
      // Guard: New reviews can ONLY be added to the latest version of the project
      if (Array.isArray(reviewRecord.versions) && reviewRecord.versions.length > 0) {
        if (targetVer && targetVer.id !== reviewRecord.versions[0].id) {
          return jsonError(400, "Reviews can only be added to the latest version of the project");
        }
      }

      const rev = body.review;
      if (!rev?.text?.trim() || !rev?.author?.trim()) {
        return jsonError(400, "Author name and review text are required");
      }
      const newReview = {
        id: rev.id || `rev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        x: typeof rev.x === "number" ? rev.x : 50,
        y: typeof rev.y === "number" ? rev.y : 50,
        author: rev.author.trim(),
        text: rev.text.trim(),
        createdAt: rev.createdAt || Date.now(),
        resolved: false,
      };
      currentReviews = [...currentReviews, newReview];
    } else if (action === "resolve") {
      if (!isOwner) {
        return jsonError(403, "Only the project owner can resolve reviews");
      }
      const { reviewId, resolved } = body;
      currentReviews = currentReviews.map((r) =>
        r.id === reviewId ? { ...r, resolved: Boolean(resolved) } : r
      );
    } else if (action === "delete") {
      const { reviewId } = body;
      if (isOwner) {
        const target = currentReviews.find((r) => r.id === reviewId);
        if (target && !target.resolved) {
          return jsonError(403, "Owner can only delete reviews that have been resolved");
        }
      }
      currentReviews = currentReviews.filter((r) => r.id !== reviewId);
    } else if (action === "edit") {
      if (isOwner) {
        return jsonError(403, "Owner cannot edit review comments");
      }
      const { reviewId, text, author } = body;
      currentReviews = currentReviews.map((r) =>
        r.id === reviewId
          ? {
              ...r,
              text: typeof text === "string" && text.trim() ? text.trim() : r.text,
              author: typeof author === "string" && author.trim() ? author.trim() : r.author,
              updatedAt: Date.now(),
            }
          : r
      );
    } else if (action === "sync") {
      if (!isOwner) {
        return jsonError(403, "Only the project owner can sync review settings");
      }
      if (body.reviews !== undefined) currentReviews = body.reviews;
      if (body.reviewPasscode !== undefined) reviewRecord.reviewPasscode = body.reviewPasscode;
      if (body.reviewToken !== undefined) reviewRecord.reviewToken = body.reviewToken;
      if (body.sourceImage) reviewRecord.sourceImage = body.sourceImage;
      if (body.renderedImage) reviewRecord.renderedImage = body.renderedImage;
      if (body.versions !== undefined) reviewRecord.versions = body.versions;
      if (body.activeVersionId !== undefined) reviewRecord.activeVersionId = body.activeVersionId;
    } else {
      return jsonError(400, "Invalid review action");
    }

    if (targetVer) targetVer.reviews = currentReviews;
    // Note: for backward compatibility, keep root reviews in sync with active version for canvas rendering
    if (!targetVer || targetVer.id === reviewRecord.activeVersionId) {
      reviewRecord.reviews = currentReviews;
    }

    await me.puter.kv.set(reviewKey, reviewRecord);

    // If owner is authenticated, also sync with owner's personal KV
    if (isOwner && userPuter) {
      try {
        const personalKey = `${PROJECT_PREFIX}${projectId}`;
        const rawPersonal = await userPuter.kv.get(personalKey);
        if (rawPersonal) {
          const personal = typeof rawPersonal === "string" ? JSON.parse(rawPersonal) : rawPersonal;
          personal.reviews = reviewRecord.reviews;
          if (reviewRecord.versions) personal.versions = reviewRecord.versions;
          if (reviewRecord.activeVersionId) personal.activeVersionId = reviewRecord.activeVersionId;
          personal.reviewToken = reviewRecord.reviewToken;
          personal.reviewPasscode = reviewRecord.reviewPasscode;
          if (reviewRecord.sourceImage) personal.sourceImage = reviewRecord.sourceImage;
          if (reviewRecord.renderedImage) personal.renderedImage = reviewRecord.renderedImage;
          await userPuter.kv.set(personalKey, personal);
        }
      } catch (syncErr) {
        console.warn("Could not sync to personal KV", syncErr);
      }
    }

    return {
      success: true,
      reviews: reviewRecord.reviews,
      versionId: targetVer?.id || body.versionId,
      versions: isOwner ? reviewRecord.versions : undefined,
      reviewToken: reviewRecord.reviewToken,
      reviewPasscode: reviewRecord.reviewPasscode,
    };
  } catch (e) {
    return jsonError(500, "Failed to process review action", {
      message: e.message || "Unknown error",
    });
  }
});

// Version lifecycle & revision endpoint (create new iteration, switch version, update retention settings)
router.post("/api/projects/version", async ({ request, user }) => {
  try {
    const userPuter = user?.puter;
    const body = await request.json();
    const { projectId, action, reviewToken } = body;

    if (!projectId) return jsonError(400, "Project ID is required");

    const reviewKey = `${REVIEW_PREFIX}${projectId}`;
    const rawReview = await me.puter.kv.get(reviewKey);
    let reviewRecord = rawReview
      ? typeof rawReview === "string"
        ? JSON.parse(rawReview)
        : rawReview
      : null;

    let isOwner = false;
    let personalProject = null;
    let personalKey = null;

    if (userPuter) {
      try {
        const userInfo = await getUserInfo(userPuter);
        personalKey = `${PROJECT_PREFIX}${projectId}`;
        const rawPersonal = await userPuter.kv.get(personalKey);
        if (rawPersonal) {
          personalProject =
            typeof rawPersonal === "string"
              ? JSON.parse(rawPersonal)
              : rawPersonal;
          isOwner = Boolean(
            (userInfo?.uuid &&
              personalProject.ownerId &&
              userInfo.uuid === personalProject.ownerId) ||
              (userInfo?.username &&
                personalProject.ownerName &&
                userInfo.username.toLowerCase() ===
                  personalProject.ownerName.toLowerCase())
          );
        }
      } catch {}
    }

    const isValidClient = Boolean(
      reviewToken &&
        reviewRecord?.reviewToken &&
        reviewToken === reviewRecord.reviewToken
    );

    if (!isOwner && !isValidClient) {
      return jsonError(403, "Unauthorized to manage versions for this project");
    }

    const targetRecord = reviewRecord || personalProject;
    if (!targetRecord) return jsonError(404, "Project record not found");

    const maxVersions = targetRecord.maxVersions || DEFAULT_MAX_VERSIONS;
    const retentionDays = targetRecord.retentionDays || DEFAULT_RETENTION_DAYS;

    let versions = Array.isArray(targetRecord.versions)
      ? [...targetRecord.versions]
      : [];
    // Note: for backward compatibility with legacy projects that lack a versions array, wrap existing assets as Version 1 baseline
    if (versions.length === 0) {
      const initVer = {
        id: `ver_${targetRecord.timestamp || Date.now()}_v1`,
        versionNumber: 1,
        name: "Version 1",
        sourceImage: targetRecord.sourceImage,
        renderedImage: targetRecord.renderedImage || null,
        timestamp: targetRecord.timestamp || Date.now(),
        createdAt: new Date(targetRecord.timestamp || Date.now()).toISOString(),
        reviews: targetRecord.reviews || [],
      };
      versions = [initVer];
      targetRecord.activeVersionId = initVer.id;
    }

    if (action === "create") {
      if (!isOwner) {
        return jsonError(403, "Only the owner/builder can create new revisions");
      }

      // Step 1: Guardrail - All feedback pins on the outgoing version must be resolved before advancing
      const currentActiveVer =
        versions.find((v) => v.id === targetRecord.activeVersionId) ||
        versions[0];
      const unresolvedReviews = (currentActiveVer?.reviews || []).filter(
        (r) => !r.resolved
      );
      if (unresolvedReviews.length > 0) {
        return jsonError(
          400,
          `Cannot create new revision: All comments on the current version must be resolved first (${unresolvedReviews.length} unresolved).`
        );
      }

      // Step 2: Snapshot and preserve all reviews on the outgoing active version for history
      if (currentActiveVer) {
        const existingReviews =
          Array.isArray(targetRecord.reviews) && targetRecord.reviews.length > 0
            ? targetRecord.reviews
            : (currentActiveVer.reviews || []);
        currentActiveVer.reviews = existingReviews;
      }

      const { sourceImage, renderedImage, name } = body;
      if (!sourceImage) {
        return jsonError(400, "Source floor plan image is required for new version");
      }

      // Step 3: Compute next version number and create fresh revision object
      const highestNum = versions.reduce(
        (max, v) => Math.max(max, v.versionNumber || 0),
        0
      );
      const nextNum = highestNum + 1;
      const newVersion = {
        id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        versionNumber: nextNum,
        name: name?.trim() || `Version ${nextNum}`,
        sourceImage,
        renderedImage: renderedImage || null,
        timestamp: Date.now(),
        createdAt: new Date().toISOString(),
        reviews: [], // Fresh reviews slate for the new iteration
      };

      // Step 4: Prepend newest version and activate it
      versions.unshift(newVersion);
      targetRecord.activeVersionId = newVersion.id;
      targetRecord.sourceImage = newVersion.sourceImage;
      targetRecord.renderedImage = newVersion.renderedImage;
      targetRecord.reviews = [];

      // Step 5: Auto-prune older intermediate versions exceeding retentionDays or maxVersions (Version 1 & active are protected)
      versions = pruneVersions(
        versions,
        targetRecord.activeVersionId,
        maxVersions,
        retentionDays
      );
      targetRecord.versions = versions;
    } else if (action === "switch") {
      if (!isOwner) {
        return jsonError(403, "Only the owner/builder can switch project versions");
      }
      const { versionId } = body;

      // Switch active working view to selected historical version
      const targetVer = versions.find((v) => v.id === versionId);
      if (!targetVer) return jsonError(404, "Target version not found");

      targetRecord.activeVersionId = targetVer.id;
      targetRecord.sourceImage = targetVer.sourceImage;
      targetRecord.renderedImage = targetVer.renderedImage;
      targetRecord.reviews = targetVer.reviews || [];
    } else if (action === "settings") {
      if (!isOwner) {
        return jsonError(403, "Only the owner can update version settings");
      }
      // Update retention limit and immediately auto-prune if limits are decreased
      if (typeof body.maxVersions === "number" && body.maxVersions >= 1) {
        targetRecord.maxVersions = Math.min(20, Math.max(1, body.maxVersions));
      }
      if (typeof body.retentionDays === "number" && body.retentionDays >= 1) {
        targetRecord.retentionDays = Math.min(365, Math.max(1, body.retentionDays));
      }
      versions = pruneVersions(
        versions,
        targetRecord.activeVersionId,
        targetRecord.maxVersions || maxVersions,
        targetRecord.retentionDays || retentionDays
      );
      targetRecord.versions = versions;
    } else if (action === "delete") {
      if (!isOwner) {
        return jsonError(403, "Only the owner can delete versions");
      }
      const { versionId } = body;
      if (versions.length <= 1) {
        return jsonError(400, "Cannot delete the only existing version");
      }
      versions = versions.filter((v) => v.id !== versionId);
      if (targetRecord.activeVersionId === versionId) {
        targetRecord.activeVersionId = versions[0].id;
        targetRecord.sourceImage = versions[0].sourceImage;
        targetRecord.renderedImage = versions[0].renderedImage;
        targetRecord.reviews = versions[0].reviews || [];
      }
      targetRecord.versions = versions;
    } else {
      return jsonError(400, "Invalid version action");
    }

    // Persist to review storage
    await me.puter.kv.set(reviewKey, {
      ...(reviewRecord || {}),
      ...targetRecord,
      versions,
    });

    // If owner is authenticated, also sync with owner's personal KV
    if (isOwner && userPuter && personalKey) {
      try {
        const rawP = await userPuter.kv.get(personalKey);
        if (rawP) {
          const p = typeof rawP === "string" ? JSON.parse(rawP) : rawP;
          p.versions = versions;
          p.activeVersionId = targetRecord.activeVersionId;
          p.sourceImage = targetRecord.sourceImage;
          p.renderedImage = targetRecord.renderedImage;
          p.reviews = targetRecord.reviews;
          p.maxVersions = targetRecord.maxVersions;
          p.retentionDays = targetRecord.retentionDays;
          await userPuter.kv.set(personalKey, p);
        }
      } catch (err) {
        console.warn("Failed to sync version to personal vault:", err);
      }
    }

    return {
      success: true,
      activeVersionId: targetRecord.activeVersionId,
      versions: isOwner ? versions : undefined,
      currentVersion: versions.find(
        (v) => v.id === targetRecord.activeVersionId
      ),
    };
  } catch (e) {
    return jsonError(500, "Failed to execute version action", {
      message: e.message || "Unknown error",
    });
  }
});
