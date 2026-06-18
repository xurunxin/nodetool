import {
  createDataUrl,
  inferImageMime
} from "@nodetool-ai/nodes-utils/china-media";
import { loadMediaRefBytes } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";

export async function imageRefToDashScopeUrl(
  image: unknown,
  context?: ProcessingContext
): Promise<string | null> {
  const record = image && typeof image === "object"
    ? (image as Record<string, unknown>)
    : {};
  const uri = typeof record.uri === "string" ? record.uri : "";
  if (
    uri.startsWith("http://") ||
    uri.startsWith("https://") ||
    uri.startsWith("data:")
  ) {
    return uri;
  }

  const bytes = await loadMediaRefBytes(record, context);
  if (!bytes || bytes.length === 0) {
    return null;
  }
  return createDataUrl(bytes, inferImageMime(bytes, "image/png"));
}

export async function imageRefsToDashScopeUrls(
  images: unknown,
  context?: ProcessingContext
): Promise<string[]> {
  const refs = Array.isArray(images) ? images : images ? [images] : [];
  const urls = await Promise.all(
    refs.map((image) => imageRefToDashScopeUrl(image, context))
  );
  return urls.filter((url): url is string => url !== null);
}
