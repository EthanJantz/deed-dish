import index from "./index.html";
const BASE_URL = "http://cdn.deeddish.com";

const server = Bun.serve({
  port: 23000,
  routes: {
    "/": index,
  },
});

console.log(`Server running at http://localhost:${server.port}`);
