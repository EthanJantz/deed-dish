import index from "./index.html"

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

