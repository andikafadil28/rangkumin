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
