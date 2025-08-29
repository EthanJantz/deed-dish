import index from "./index.html"

const server = Bun.serve({
  port: 23000,
  routes: {
    "/": index
  },
  development: {
    hmr: true,
    console: true,
  }
});

console.log(`Server running at http://localhost:${server.port}`);

