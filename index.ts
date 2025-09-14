import index from "./index.html";
const BASE_URL = "http://cdn.deeddish.com";

const server = Bun.serve({
  port: 23000,
  routes: {
    "/": index,
    "/data/pin/:pin": {
      GET: async (req) => {
        const pin = req.params.pin;
        const url = `${BASE_URL}/pin/${pin}`;
        console.log(`Proxying request to ${url}`);

        try {
          const response = await fetch(url);

          if (!response.ok) {
            console.log(`File not found: ${url}`);
            return new Response("File not found", { status: 404 });
          }

          // Get the uncompressed text and return it
          const text = await response.text();
          return new Response(text, {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=300",
            },
          });
        } catch (error) {
          console.error(`Proxy error for ${url}:`, error);
          return new Response("Internal server error", { status: 500 });
        }
      },
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
      },
    },
    "/data/entity_files.json": {
      GET: async (req) => {
        try {
          const file = Bun.file("./data/entity_files.json");
          const exists = await file.exists();
          if (!exists) {
            return new Response("Entity files mapping not found", {
              status: 404,
            });
          }
          return new Response(file);
        } catch (error) {
          console.error("Error serving entity files mapping:", error);
          return new Response("Internal server error", { status: 500 });
        }
      },
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at http://localhost:${server.port}`);
