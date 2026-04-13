export function withNoStoreHeaders(init?: ResponseInit): ResponseInit {
  const headers = new Headers(init?.headers);

  headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");

  return {
    ...init,
    headers,
  };
}
