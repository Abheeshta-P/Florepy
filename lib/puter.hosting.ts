import puter from "@heyputer/puter.js";
import {
  createHostingSlug,
  fetchBlobFromUrl,
  getHostedUrl,
  getImageExtension,
  HOSTING_CONFIG_KEY,
  imageUrlToPngBlob,
  isHostedUrl,
} from "./utils";

// check if subdomain in keyvakue pair [KV STORE WORKERS]
type HostingConfig = { subdomain: string };
type HostedAsset = { url: string };

export const getOrCreateHostingConfig =
  async (): Promise<HostingConfig | null> => {
    try {
      const existing = (await puter.kv.get(
        HOSTING_CONFIG_KEY,
      )) as HostingConfig | null;
      if (existing?.subdomain) return { subdomain: existing.subdomain };

      // Check if a florepy hosting site already exists without prompting permissions
      try {
        const hostedSites = (await puter.hosting.list()) as Array<{ subdomain: string }>;
        const found = hostedSites?.find((s) => s.subdomain?.startsWith("florepy-"));
        if (found?.subdomain) {
          const record: HostingConfig = { subdomain: found.subdomain };
          await puter.kv.set(HOSTING_CONFIG_KEY, record).catch(() => {});
          return record;
        }
      } catch {
        // Continue if listing fails
      }

      const subdomain = createHostingSlug();
      
      const hasPerms = await puter.perms.requestManageSubdomains();
      if (!hasPerms) {
        console.warn("Manage subdomains permission denied by user.");
        return null;
      }
      
      const created = await puter.hosting.create(subdomain, ".");

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
  visibility,
}: StoreHostedImageParams): Promise<HostedAsset | null> => {
  if (!url) return null;
  if (visibility !== "private" && !hosting) return null;

  if (isHostedUrl(url)) return { url };

  try {
    const resolved =
      label === "rendered"
        ? await imageUrlToPngBlob(url).then((blob) =>
            blob ? { blob, contentType: "image/png" } : null,
          )
        : await fetchBlobFromUrl(url);

    if (!resolved) return null;

    const contentType = resolved.contentType || resolved.blob.type || "";
    const ext = getImageExtension(contentType, url);
    const dir = `project/${projectId}`;
    const filePath = `${dir}/${label}.${ext}`;

    const uploadFile = new File([resolved.blob], `${label}.${ext}`, {
      type: contentType,
    });

    await puter.fs.mkdir(dir, { createMissingParents: true });
    await puter.fs.write(filePath, uploadFile);

    if (hosting) {
      const hostedUrl = getHostedUrl({ subdomain: hosting.subdomain }, filePath);
      if (hostedUrl) return { url: hostedUrl };
    }

    const privateUrl = await puter.fs.getReadURL(filePath);
    return { url: privateUrl };
  } catch (error) {
    console.warn(`Failed to store the hosted image: ${error}`);
    return null;
  }
};
