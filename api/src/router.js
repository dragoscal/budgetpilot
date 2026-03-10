// Minimal router for Cloudflare Workers

export class Router {
  constructor() {
    this.routes = [];
    this.middlewares = [];
  }

  use(fn) {
    this.middlewares.push(fn);
  }

  add(method, path, handler) {
    // Convert path params to regex: /api/:table/:id → /api/([^/]+)/([^/]+)
    const paramNames = [];
    const pattern = path.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    this.routes.push({ method: method.toUpperCase(), pattern: new RegExp(`^${pattern}$`), paramNames, handler });
  }

  get(path, handler) { this.add('GET', path, handler); }
  post(path, handler) { this.add('POST', path, handler); }
  put(path, handler) { this.add('PUT', path, handler); }
  delete(path, handler) { this.add('DELETE', path, handler); }

  async handle(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const path = url.pathname;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Create context object
    const reqCtx = { request, env, ctx, url, params: {}, query: Object.fromEntries(url.searchParams), body: null, user: null };

    // Parse body for POST/PUT
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try {
        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          reqCtx.body = await request.json();
        } else {
          reqCtx.body = await request.text();
        }
      } catch (e) {
        reqCtx.body = null;
      }
    }

    // Run middlewares
    for (const mw of this.middlewares) {
      const result = await mw(reqCtx);
      if (result instanceof Response) return addCors(result);
    }

    // Re-read path after middleware (e.g., API versioning may rewrite it)
    const resolvedPath = reqCtx.url.pathname;

    // Match route
    for (const route of this.routes) {
      if (route.method !== method && route.method !== 'ALL') continue;
      const match = resolvedPath.match(route.pattern);
      if (!match) continue;

      // Extract params
      route.paramNames.forEach((name, i) => {
        reqCtx.params[name] = decodeURIComponent(match[i + 1]);
      });

      try {
        const response = await route.handler(reqCtx);
        return addCors(response);
      } catch (err) {
        console.error('Route error:', err);
        return addCors(json({ error: err.message || 'Internal error' }, 500));
      }
    }

    return addCors(json({ error: 'Not found' }, 404));
  }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    'Access-Control-Max-Age': '86400',
  };
}

function addCors(response) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders())) {
    headers.set(k, v);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
