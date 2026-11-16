import { randomInt } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

const links = new Map();
const base62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const port = Number(process.env.PORT ?? 3000);
const configuredBaseUrl =
  process.env.BASE_URL ??
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : "http://localhost:3000");
const baseUrl = new URL(configuredBaseUrl);
const publicRoot = process.env.PUBLIC_DIR
  ? resolve(process.cwd(), process.env.PUBLIC_DIR)
  : null;
const publicRealRoot = publicRoot ? await realpath(publicRoot) : null;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

if (!["http:", "https:"].includes(baseUrl.protocol)) {
  throw new Error("BASE_URL must use http or https");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

function createCode() {
  return Array.from({ length: 6 }, () => base62[randomInt(base62.length)]).join(
    "",
  );
}

async function findPublicFile(pathname) {
  if (!publicRoot) return null;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const requestedPath =
    decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const candidate = resolve(publicRoot, requestedPath);
  const candidateRelative = relative(publicRoot, candidate);
  if (candidateRelative.startsWith("..") || isAbsolute(candidateRelative)) {
    return null;
  }

  try {
    const filePath = await realpath(candidate);
    const realRelative = relative(publicRealRoot, filePath);
    if (realRelative.startsWith("..") || isAbsolute(realRelative)) return null;
    if (!(await stat(filePath)).isFile()) return null;
    return filePath;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }
}

Bun.serve({
  port,
  async fetch(request) {
    const requestUrl = new URL(request.url);
    const { pathname } = requestUrl;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "POST" && pathname === "/api/links") {
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Request body must be valid JSON" }, 400);
      }

      if (typeof body?.url !== "string") {
        return jsonResponse({ error: "url must be a valid HTTP(S) URL" }, 400);
      }

      let originalUrl;
      try {
        originalUrl = new URL(body.url);
      } catch {
        return jsonResponse({ error: "url must be a valid HTTP(S) URL" }, 400);
      }
      if (!["http:", "https:"].includes(originalUrl.protocol)) {
        return jsonResponse({ error: "url must be a valid HTTP(S) URL" }, 400);
      }

      let code = createCode();
      while (links.has(code)) code = createCode();

      const link = {
        code,
        url: body.url,
        shortUrl: `${baseUrl.origin}/${code}`,
        hits: 0,
        createdAt: new Date().toISOString(),
      };
      links.set(code, link);
      return jsonResponse(link, 201);
    }

    if (request.method === "GET" && pathname === "/api/links") {
      return jsonResponse(Array.from(links.values()));
    }

    if (request.method === "GET") {
      const filePath = await findPublicFile(pathname);
      if (filePath) {
        return new Response(Bun.file(filePath), { headers: corsHeaders });
      }
    }

    if (
      request.method === "GET" &&
      pathname.length > 1 &&
      !pathname.slice(1).includes("/")
    ) {
      const link = links.get(pathname.slice(1));
      if (!link) return jsonResponse({ error: "Link not found" }, 404);

      link.hits += 1;
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: link.url },
      });
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
});

console.log(`Snip backend listening on port ${port}`);
