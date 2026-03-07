import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/session/get-server-session";
import { getUserVercelToken } from "@/lib/vercel/token";

const VERCEL_PROJECT_ENV_URL = "https://api.vercel.com/v10/projects";
const FORWARDED_QUERY_PARAMS = [
  "gitBranch",
  "decrypt",
  "source",
  "customEnvironmentId",
  "customEnvironmentSlug",
  "teamId",
  "slug",
] as const;

export const dynamic = "force-dynamic";

function getUpstreamUrl(req: Request, idOrName: string): URL {
  const requestUrl = new URL(req.url);
  const upstreamUrl = new URL(
    `${VERCEL_PROJECT_ENV_URL}/${encodeURIComponent(idOrName)}/env`,
  );

  for (const key of FORWARDED_QUERY_PARAMS) {
    const value = requestUrl.searchParams.get(key);
    if (!value) continue;

    if (key === "decrypt" && value !== "true" && value !== "false") {
      continue;
    }

    upstreamUrl.searchParams.set(key, value);
  }

  return upstreamUrl;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ idOrName: string }> },
) {
  const session = await getServerSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const token = await getUserVercelToken(session.user.id);

  if (!token) {
    return NextResponse.json(
      { error: "Vercel not connected" },
      { status: 401 },
    );
  }

  const { idOrName } = await params;

  if (!idOrName) {
    return NextResponse.json(
      { error: "Project id or name is required" },
      { status: 400 },
    );
  }

  try {
    const upstreamResponse = await fetch(getUpstreamUrl(req, idOrName), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: req.signal,
    });

    const body = await upstreamResponse.text();
    const headers = new Headers();
    const contentType = upstreamResponse.headers.get("content-type");

    if (contentType) {
      headers.set("Content-Type", contentType);
    }

    headers.set("Cache-Control", "no-store");

    return new Response(body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers,
    });
  } catch (error) {
    console.error(
      "Failed to fetch Vercel project environment variables:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to fetch Vercel project environment variables" },
      { status: 500 },
    );
  }
}
