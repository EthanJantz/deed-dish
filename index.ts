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
    },
    "/data/entity/:filename": {
      GET: async (req) => {
        const filename = req.params.filename;
        try {
          const file = Bun.file(`./data/entity/${filename}`);
          const exists = await file.exists();
          if (!exists) {
            return new Response("Entity file not found", { status: 404 });
          }
          return new Response(file);
        } catch (error) {
          console.error(`Error serving entity file ${filename}:`, error);
          return new Response("Internal server error", { status: 500 });
        }
      },
      HEAD: async (req) => {
        const filename = req.params.filename;
        try {
          const file = Bun.file(`./data/entity/${filename}`);
          const exists = await file.exists();
          if (!exists) {
            return new Response(null, { status: 404 });
          }
          return new Response(null, { status: 200 });
        } catch (error) {
          console.error(`Error checking entity file ${filename}:`, error);
          return new Response(null, { status: 500 });
        }
      }
    },
    "/data/entity_files.json": {
      GET: async (req) => {
        try {
          const file = Bun.file("./data/entity_files.json");
          const exists = await file.exists();
          if (!exists) {
            return new Response("Entity files mapping not found", { status: 404 });
          }
          return new Response(file);
        } catch (error) {
          console.error("Error serving entity files mapping:", error);
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

