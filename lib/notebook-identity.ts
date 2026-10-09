/** The random browser key is a bearer capability; only its hash is used in storage. */
export async function notebookOwnerId(authenticatedUserId: string | null, browserKey: string | null): Promise<string | null> {
  if (authenticatedUserId) return authenticatedUserId;
  if (!browserKey || !/^[a-f0-9]{64}$/.test(browserKey)) return null;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(browserKey));
  return "browser-" + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}
