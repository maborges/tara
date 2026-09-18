import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const backendUrl = getBackendOrigin();
const standaloneService = !process.env.BACKEND_URL || Boolean(process.env.TARA_SERVICE_URL);

function getBackendOrigin() {
  const raw = (
    process.env.TARA_SERVICE_URL ||
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:8010"
  ).replace(/\/$/, "");
  const value = raw.startsWith("http://") || raw.startsWith("https://") ? raw : "http://127.0.0.1:8010";

  if (value.endsWith("/api/v1")) {
    return value.replace(/\/api\/v1$/, "");
  }

  return value;
}

function buildTargetUrl(request: NextRequest, path: string[]) {
  const joinedPath = path.join("/");
  const targetPath = standaloneService
    ? mapStandalonePath(path)
    : `/api/v1/${joinedPath}`;
  const target = new URL(`${backendUrl}${targetPath}`);
  target.search = request.nextUrl.search;
  return target;
}

function mapStandalonePath(path: string[]) {
  const joined = path.join("/");
  const mappings: Record<string, string> = {
    "balanca/devices/activate": "/v1/stations/activate",
    "balanca/sync/push": "/v1/stations/sync/push",
    "balanca/sync/pull": "/v1/stations/sync/pull",
    "balanca/operadores/ativos": "/v1/stations/operators",
    "balanca/operadores/login": "/v1/stations/operators/login",
    "balanca/provisioning": "/v1/stations/provisioning",
  };
  return mappings[joined] || `/api/v1/${joined}`;
}

function withNoStoreHeaders(headers: Headers) {
  const nextHeaders = new Headers(headers);
  nextHeaders.set("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  nextHeaders.set("pragma", "no-cache");
  nextHeaders.set("expires", "0");
  nextHeaders.delete("etag");
  return nextHeaders;
}

async function proxy(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const targetUrl = buildTargetUrl(request, path);
  const method = request.method;
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
  const headers = new Headers(request.headers);

  headers.set("host", new URL(backendUrl).host);
  // A API Key técnica é necessária apenas para a ativação inicial. Depois
  // disso, a estação autentica suas operações com o station_token próprio.
  // Isso permite rotacionar a credencial técnica sem interromper estações
  // ativas ou suas filas offline.
  if (standaloneService && path.join("/") === "balanca/devices/activate") {
    headers.set("X-Balanca-Client-ID", process.env.TARA_SERVICE_CLIENT_ID || "");
    headers.set("X-Balanca-Client-Secret", process.env.TARA_SERVICE_CLIENT_SECRET || "");
  }
  try {
    const response = await fetch(targetUrl, {
      method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      cache: "no-store",
      redirect: "follow",
    });

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: withNoStoreHeaders(response.headers),
    });
  } catch {
    return NextResponse.json(
      {
        detail: "Não foi possível contatar o backend. Verifique a conexão da estação.",
        source: "balanca-next-proxy",
      },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(request, ctx);
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(request, ctx);
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(request, ctx);
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(request, ctx);
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(request, ctx);
}

export async function OPTIONS(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(request, ctx);
}
