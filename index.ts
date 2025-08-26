import index from "./index.html"

console.log("Starting server on http://localhost:23000");

Bun.serve({
  port: 23000,
  routes: {
    "/": index
  },
  development: {
    hmr: true,
    console: true,
  }
});

