import { handler } from "../server.mjs";

// Every public URL is routed here by vercel.json so that the existing
// application-level Basic authentication also protects HTML, styles and assets.
export default function vercelHandler(request, response) {
  // The Vercel route adds /api in front of the original URL. Remove only that
  // internal prefix before passing the request to the shared application.
  if (request.url === "/api" || request.url === "/api/") {
    request.url = "/";
  } else if (request.url?.startsWith("/api/")) {
    request.url = request.url.slice(4);
  }

  return handler(request, response);
}
