export function shouldHandleNavigation(
  requestUrl: string,
  appOrigin: string,
  requestMode: RequestMode,
) {
  const url = new URL(requestUrl);
  const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
  const isAccess =
    url.pathname === "/cdn-cgi/access" ||
    url.pathname.startsWith("/cdn-cgi/access/");
  return (
    requestMode === "navigate" &&
    url.origin === appOrigin &&
    !isApi &&
    !isAccess
  );
}

export async function fetchNavigation(
  fetchLatest: () => Promise<Response>,
  getCachedShell: () => Promise<Response | undefined>,
) {
  try {
    return await fetchLatest();
  } catch {
    return (
      (await getCachedShell()) ??
      new Response("Rangkumin belum pernah dibuka online di perangkat ini.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}
