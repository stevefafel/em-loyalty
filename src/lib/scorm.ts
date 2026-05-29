import JSZip from "jszip";

/**
 * Helpers for handling SCORM uploads, including "collection" packages — a zip
 * whose entries are themselves individual SCORM package zips (a bundle of
 * courses exported together). Collections are split into one module per course
 * at upload time so each course flows through the normal single-package path.
 */

export interface ScormCourse {
  /** Human-readable title derived from the inner zip's filename. */
  title: string;
  /** Original inner zip filename (e.g. "Benefits of Mobil 1_course-949-...zip"). */
  filename: string;
  /** The inner SCORM package contents. */
  buffer: ArrayBuffer;
}

/** A package is a flat SCORM package if it has an entry point at its root. */
function hasRootEntryPoint(zip: JSZip): boolean {
  return Object.values(zip.files).some((f) => {
    if (f.dir) return false;
    const base = f.name.split("/").pop()?.toLowerCase();
    return base === "index.html" || base === "imsmanifest.xml";
  });
}

/**
 * A collection is a zip that contains nested .zip packages but no SCORM entry
 * point of its own. (A normal SCORM package always exposes index.html /
 * imsmanifest.xml; a bundle hides those inside the nested zips.)
 */
export function isScormCollection(zip: JSZip): boolean {
  const hasNestedZips = Object.values(zip.files).some(
    (f) => !f.dir && f.name.toLowerCase().endsWith(".zip")
  );
  return hasNestedZips && !hasRootEntryPoint(zip);
}

/**
 * Turn an inner zip filename into a readable course title.
 * e.g. "customer greeting and communications course-973-cloud-prod-...zip"
 *      -> "Customer greeting and communications"
 */
export function courseTitleFromFilename(filename: string): string {
  let name = filename.replace(/\.zip$/i, "");

  // Real titles precede the vendor's "course-NNN..." suffix.
  const courseIdx = name.search(/[_\s-]*course-\d/i);
  if (courseIdx > 0) {
    name = name.slice(0, courseIdx);
  }

  name = name.replace(/[_\s-]+$/, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();

  if (!name) name = filename.replace(/\.zip$/i, "");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Extract each nested SCORM package from a collection zip, in stable
 * (filename-sorted) order.
 */
export async function extractScormCourses(
  collection: JSZip
): Promise<ScormCourse[]> {
  const innerNames = Object.values(collection.files)
    .filter((f) => !f.dir && f.name.toLowerCase().endsWith(".zip"))
    .map((f) => f.name)
    .sort((a, b) => a.localeCompare(b));

  const courses: ScormCourse[] = [];
  for (const name of innerNames) {
    const file = collection.file(name);
    if (!file) continue;
    const buffer = await file.async("arraybuffer");
    courses.push({
      title: courseTitleFromFilename(name.split("/").pop() || name),
      filename: name.split("/").pop() || name,
      buffer,
    });
  }
  return courses;
}
