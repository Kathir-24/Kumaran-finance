import { NextRequest, NextResponse } from 'next/server';
import { handleBffProxyRequest } from '@/lib/bff-api-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ path: string[] }> };

const createNextResponse = (body: BodyInit | null, init: ResponseInit) =>
  new NextResponse(body, init);

export const GET = (request: NextRequest, context: RouteContext) =>
  handleBffProxyRequest(request, context, createNextResponse);

export const POST = (request: NextRequest, context: RouteContext) =>
  handleBffProxyRequest(request, context, createNextResponse);

export const PUT = (request: NextRequest, context: RouteContext) =>
  handleBffProxyRequest(request, context, createNextResponse);

export const PATCH = (request: NextRequest, context: RouteContext) =>
  handleBffProxyRequest(request, context, createNextResponse);

export const DELETE = (request: NextRequest, context: RouteContext) =>
  handleBffProxyRequest(request, context, createNextResponse);
