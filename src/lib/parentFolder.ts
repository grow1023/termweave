/**
 * A path a remote PC's bridge can list: absolute or under ~. Its bridge reads a relative folder
 * from the pane's folder only from a newer bundle on; until then it would list its own folder.
 */
export const LISTABLE_ON_REMOTE = /^(?:\/|~(?:\/|$)|[A-Za-z]:[\\/])/;

/**
 * The folder that holds `path`: "." for a bare name (the pane's folder), null when the path
 * names nothing above itself ("", "/", "~").
 */
export function parentFolder(path: string): string | null {
  const trimmed = path.replace(/[\\/]+$/, "");
  if (trimmed === "" || trimmed === "~" || /^[A-Za-z]:$/.test(trimmed)) return null;
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (cut < 0) return ".";
  if (cut === 0) return "/";
  const parent = trimmed.slice(0, cut);
  // "C:\file" lives in the drive's root, "C:\", not in "C:"
  return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent;
}
