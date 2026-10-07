// randomUUID requires HTTPS; getRandomValues also works on an HTTP test server.
// These 128 random bits identify retries of one order, not an authentication token.
export function createRequestKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
