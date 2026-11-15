import http from "node:http";

// A deliberately tiny, read-only PostgREST stand-in for static generation.
// It prevents credential-free OpenNext builds from contacting any Supabase
// project while allowing catalog reads to prerender as an empty catalog.
const port = Number(process.env.MOCK_SUPABASE_PORT || 54321);

const server = http.createServer((request, response) => {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader(
    "access-control-allow-headers",
    "apikey, authorization, content-type, accept, prefer",
  );
  response.setHeader("access-control-allow-methods", "GET, HEAD, OPTIONS");

  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }

  const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
  if (!url.pathname.startsWith("/rest/v1/")) {
    response.writeHead(404, { "content-type": "application/json" }).end("{}");
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response
      .writeHead(405, { "content-type": "application/json" })
      .end(JSON.stringify({ message: "Build mock is read-only" }));
    return;
  }

  const table = url.pathname.slice("/rest/v1/".length);
  const wantsObject = request.headers.accept?.includes(
    "application/vnd.pgrst.object+json",
  );
  let body = "[]";

  // The storefront status helpers use .single() and need a realistic open
  // default so static generation can complete without consulting a database.
  if (table === "store_settings" && wantsObject) {
    body = JSON.stringify({
      id: true,
      store_status: "open",
      notice_message: null,
      scheduled_status: null,
      scheduled_at: null,
      scheduled_reopen_at: null,
      robux_via_link_enabled: true,
    });
  }

  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-range": "*/0",
  });
  response.end(request.method === "HEAD" ? undefined : body);
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(
    `Read-only build Supabase mock listening on 127.0.0.1:${port}\n`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
