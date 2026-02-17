import http from "node:http";

const port = Number(process.env.PORT ?? "3000");

const server = http.createServer((_req, res) => {
  const body = [
    "# better-env + Fly Node Demo",
    "",
    `PUBLIC_APP_NAME=${process.env.PUBLIC_APP_NAME ?? "(not configured)"}`,
    `API_BASE_URL=${process.env.API_BASE_URL ?? "(not configured)"}`,
  ].join("\n");

  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.writeHead(200);
  res.end(body);
});

server.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
