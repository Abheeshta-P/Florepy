import puter from "@heyputer/puter.js";
import {
  createHostingSlug,
  fetchBlobFromUrl,
  getHostedUrl,
  getImageExtension,
  HOSTING_CONFIG_KEY,
  imageUrlToPngBlob,
  isHostedUrl,
  isDisplayableUrl,
} from "./utils";

// check if subdomain in keyvakue pair [KV STORE WORKERS]
type HostingConfig = { subdomain: string };
type HostedAsset = { url: string };

export const PUBLIC_HOSTING_DIR = "public";

export const getOrCreateHostingConfig =
  async (): Promise<HostingConfig | null> => {
    try {
      // Ensure the dedicated public hosting directory exists
      await puter.fs.mkdir(PUBLIC_HOSTING_DIR, { createMissingParents: true }).catch(() => {});

      const existing = (await puter.kv.get(
        HOSTING_CONFIG_KEY,
      )) as HostingConfig | null;
      if (existing?.subdomain) {
        // Ensure the subdomain is mounted strictly to the public directory
        await puter.hosting.update(existing.subdomain, PUBLIC_HOSTING_DIR).catch(() => {});
        return { subdomain: existing.subdomain };
      }

      // Check if a florepy hosting site already exists but not stored in KV without prompting permissions
      try {
        const hostedSites = (await puter.hosting.list()) as Array<{ subdomain: string }>;
        const found = hostedSites?.find((s) => s.subdomain?.startsWith("florepy-"));
        if (found?.subdomain) {
          await puter.hosting.update(found.subdomain, PUBLIC_HOSTING_DIR).catch(() => {});
          const record: HostingConfig = { subdomain: found.subdomain };
          await puter.kv.set(HOSTING_CONFIG_KEY, record).catch(() => {});
          return record;
        }
      } catch {
        // Continue if listing fails
      }

      // CREATE subdomain if it is neither in KV nor in list
      const subdomain = createHostingSlug();
      
      const hasPerms = await puter.perms.requestManageSubdomains();
      if (!hasPerms) {
        console.warn("Manage subdomains permission denied by user.");
        return null;
      }
      
      // Mount hosting strictly to the "public" directory
      const created = await puter.hosting.create(subdomain, PUBLIC_HOSTING_DIR);

      const record: HostingConfig = { subdomain: created.subdomain };
      await puter.kv.set(HOSTING_CONFIG_KEY, record);

      return record;
    } catch (error) {
      console.warn(`Could not find subdomain: ${error}`);
      return null;
    }
  };

export const uploadImageToHosting = async ({
  hosting,
  url,
  projectId,
  label,
  isPublic = false,
}: StoreHostedImageParams): Promise<HostedAsset | null> => {
  if (!url) return null;
  if (isPublic && !hosting) return null;

  if (isHostedUrl(url)) return { url };

  try {
    let resolved: { blob: Blob; contentType: string } | null = null;

    // If url is a Puter FS path (e.g. project/123/source.png), read directly from Puter FS
    if (url.startsWith("project/") || !isDisplayableUrl(url)) {
      try {
        const fsBlob = await puter.fs.read(url);
        if (fsBlob && fsBlob.size > 0) {
          const contentType = fsBlob.type || (url.endsWith(".svg") ? "image/svg+xml" : "image/png");
          resolved = { blob: fsBlob, contentType };
        }
      } catch (err) {
        console.warn("Could not read image from Puter FS in uploadImageToHosting:", url, err);
      }
    }

    if (!resolved) {
      resolved =
        label === "rendered"
          ? await imageUrlToPngBlob(url).then((blob) =>
              blob ? { blob, contentType: "image/png" } : null,
            )
          : await fetchBlobFromUrl(url);
    }

    if (!resolved) return null;

    const contentType = resolved.contentType || resolved.blob.type || "";
    const ext = getImageExtension(contentType, url);

    // 1. Always save the primary master copy in private vault: project/{projectId}/{label}.{ext}
    const privateDir = `project/${projectId}`;
    const privateFilePath = `${privateDir}/${label}.${ext}`;

    const uploadFile = new File([resolved.blob], `${label}.${ext}`, {
      type: contentType,
    });

    await puter.fs.mkdir(privateDir, { createMissingParents: true });
    await puter.fs.write(privateFilePath, uploadFile);

    // 2. If PUBLIC, copy into the public hosting folder: public/project/{projectId}/{label}.{ext}
    if (isPublic && hosting) {
      const publicDir = `${PUBLIC_HOSTING_DIR}/project/${projectId}`;
      const publicFilePath = `${publicDir}/${label}.${ext}`;
      await puter.fs.mkdir(publicDir, { createMissingParents: true });
      await puter.fs.write(publicFilePath, uploadFile);

      const hostedUrl = getHostedUrl({ subdomain: hosting.subdomain }, `project/${projectId}/${label}.${ext}`);
      if (hostedUrl) return { url: hostedUrl };
    }

    // 3. If PRIVATE, return the private filesystem path (NEVER published to web)
    return { url: privateFilePath };
  } catch (error) {
    console.warn(`Failed to store image: ${error}`);
    return null;
  }
};
