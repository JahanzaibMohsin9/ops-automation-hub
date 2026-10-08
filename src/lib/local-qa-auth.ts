export const LOCAL_QA_AUTH_COOKIE = "qa_local_workspace";
export const LOCAL_QA_AUTH_HEADER = "x-qa-workspace-slug";
export const LOCAL_QA_AUTH_QUERY = "qaWorkspace";

export function normalizeQaWorkspaceSlug(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return normalized.length > 0 ? normalized : null;
}
