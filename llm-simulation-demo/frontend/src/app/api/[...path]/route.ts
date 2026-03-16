import { NextRequest, NextResponse } from "next/server";

// Read at runtime (not baked at build time) so the k8s BACKEND_URL env var works.
function backendUrl(): string {
  return process.env.BACKEND_URL || "http://localhost:8000";
}

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;
  const { search } = new URL(req.url);
  const target = `${backendUrl()}/api/${path.join("/")}${search}`;

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }

  const upstream = await fetch(target, init);
  const body = await upstream.text();

  return new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
