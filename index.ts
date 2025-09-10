import index from "./index.html"

const server = Bun.serve({
  port: 23000,
  routes: {
    "/": index,
    "/data/pin/:pin": {
      GET: async (req) => {
        const pin = req.params.pin;
        try {
          const file = Bun.file(`./data/pin/${pin}`);
          const exists = await file.exists();
          if (!exists) {
            return new Response("File not found", { status: 404 });
          }
          return new Response(file);
        } catch (error) {
          console.error(`Error serving PIN file ${pin}:`, error);
          return new Response("Internal server error", { status: 500 });
        }
      }
    }
  },
  development: {
    hmr: true,
    console: true,
  }
});

console.log(`Server running at http://localhost:${server.port}`);

