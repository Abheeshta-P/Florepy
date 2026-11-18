const PROJECT_PREFIX = "florepy_project_";
const COMMUNITY_PREFIX = "florepy_community_";
const REVIEW_PREFIX = "florepy_review_";

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
      isPublic,
      updatedAt: new Date().toISOString(),
    };

    // 1. Save merged record to user's private KV store
    await userPuter.kv.set(key, payload);

    // 2. Sync with the global community registry if public
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

    // 3. Keep worker review store in sync so invited clients (using ?review=token)
    // immediately view the latest rendered images, passcodes, and comment pins.
    const targetReviewToken = payload.reviewToken;
    if (targetReviewToken) {
      try {
        const reviewIndexKey = `${REVIEW_PREFIX}${project.id}`;
        const rawExistingReview = await me.puter.kv.get(reviewIndexKey);
        const existingReview = rawExistingReview
          ? (typeof rawExistingReview === "string" ? JSON.parse(rawExistingReview) : rawExistingReview)
          : {};

        // Save design assets without altering existing client comments
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
          reviews: existingReview.reviews || [],
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
            return {
              project: {
                ...reviewProject,
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

    // 3. Check global community registry (accessible to other accounts and unauthenticated visitors)
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

    reviewRecord.reviews = Array.isArray(reviewRecord.reviews) ? reviewRecord.reviews : [];

    if (action === "add") {
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
      reviewRecord.reviews.push(newReview);
    } else if (action === "resolve") {
      if (!isOwner) {
        return jsonError(403, "Only the project owner can resolve reviews");
      }
      const { reviewId, resolved } = body;
      reviewRecord.reviews = reviewRecord.reviews.map((r) =>
        r.id === reviewId ? { ...r, resolved: Boolean(resolved) } : r
      );
    } else if (action === "delete") {
      const { reviewId } = body;
      if (isOwner) {
        const target = reviewRecord.reviews.find((r) => r.id === reviewId);
        if (target && !target.resolved) {
          return jsonError(403, "Owner can only delete reviews that have been resolved");
        }
      }
      reviewRecord.reviews = reviewRecord.reviews.filter((r) => r.id !== reviewId);
    } else if (action === "edit") {
      if (isOwner) {
        return jsonError(403, "Owner cannot edit review comments");
      }
      const { reviewId, text, author } = body;
      reviewRecord.reviews = reviewRecord.reviews.map((r) =>
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
      if (body.reviews !== undefined) reviewRecord.reviews = body.reviews;
      if (body.reviewPasscode !== undefined) reviewRecord.reviewPasscode = body.reviewPasscode;
      if (body.reviewToken !== undefined) reviewRecord.reviewToken = body.reviewToken;
      if (body.sourceImage) reviewRecord.sourceImage = body.sourceImage;
      if (body.renderedImage) reviewRecord.renderedImage = body.renderedImage;
    } else {
      return jsonError(400, "Invalid review action");
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
      reviewToken: reviewRecord.reviewToken,
      reviewPasscode: reviewRecord.reviewPasscode,
    };
  } catch (e) {
    return jsonError(500, "Failed to process review action", {
      message: e.message || "Unknown error",
    });
  }
});
