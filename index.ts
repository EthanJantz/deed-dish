const server = Bun.serve({
  port: 23000,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;

    if (path === "/") path = "/index.html";
    if (path === "/about") path = "/about.html";

    const file = Bun.file(`./dist${path}`);

    if (await file.exists()) {
      return new Response(file);
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log("Server running on http://localhost:23000");
