import { ThreadInfo } from "../types/thread.types";

const DEFAULT_ENGLISH_THREAD_TITLE = "New conversation";

export const sortThreadsByDate = (
  threads: Record<string, ThreadInfo>
): Array<[string, ThreadInfo]> => {
  return Object.entries(threads).sort((a, b) => {
    const aDate = a[1].updatedAt;
    const bDate = b[1].updatedAt;
    
    // Fallback to empty string if date is undefined
    const aDateStr = aDate || "";
    const bDateStr = bDate || "";
    
    return bDateStr.localeCompare(aDateStr);
  });
};

export function getLocalizedThreadTitle(
  title: string | null | undefined,
  fallbackTitle: string
): string {
  if (!title || title === DEFAULT_ENGLISH_THREAD_TITLE) {
    return fallbackTitle;
  }
  return title;
}
