export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
    },
  });
}

export async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
