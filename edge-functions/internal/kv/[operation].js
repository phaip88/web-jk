function getKVBinding(context) {
  return context.env?.EDGE_KV ?? context.env?.__EDGE_KV__ ?? globalThis.EDGE_KV ?? globalThis.__EDGE_KV__ ?? null;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
    },
  });
}

function isAuthorized(request, env) {
  const expected = env?.KV_BRIDGE_SECRET;
  if (!expected) {
    return true;
  }

  return request.headers.get("x-kv-bridge-secret") === expected;
}

async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function onRequest(context) {
  const { request, params } = context;

  if (!isAuthorized(request, context.env)) {
    return json({ success: false, error: "Unauthorized KV bridge request." }, 401);
  }

  const kv = getKVBinding(context);
  const operation = params.operation;

  if (!kv) {
    return json(
      {
        success: false,
        error: "KV storage hasn't been set up for your EdgeOne Pages Project.",
      },
      503
    );
  }

  const body = await parseBody(request);

  try {
    if (operation === "status") {
      return json({
        success: true,
        data: {
          backend: "edge",
          writable: true,
          binding: context.env?.EDGE_KV ? "EDGE_KV" : context.env?.__EDGE_KV__ ? "__EDGE_KV__" : "global",
        },
      });
    }

    if (operation === "get") {
      return json({ success: true, data: await kv.get(body.key) });
    }

    if (operation === "put") {
      await kv.put(body.key, body.value);
      return json({ success: true, data: true });
    }

    if (operation === "delete") {
      await kv.delete(body.key);
      return json({ success: true, data: true });
    }

    if (operation === "list") {
      const result = await kv.list({ prefix: body.prefix });
      const keys = (result.keys || []).map((item) => item.name ?? item.key).filter(Boolean);
      return json({ success: true, data: keys });
    }

    return json({ success: false, error: `Unsupported KV operation: ${operation}` }, 404);
  } catch (error) {
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "KV bridge execution failed.",
      },
      500
    );
  }
}
