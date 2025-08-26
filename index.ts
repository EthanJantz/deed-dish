import index from "./index.html"

console.log("Starting server on http://localhost:23000");

Bun.serve({
  port: 23000,
  routes: {
    "/": index,
    "/data/nbd_parcels.pmtiles": {
      GET: (req) => {
        const file = Bun.file("./data/nbd_parcels.pmtiles");
        const range = req.headers.get("range");
        
        if (!range) {
          return new Response(file, {
            headers: {
              "Content-Type": "application/octet-stream",
              "Accept-Ranges": "bytes",
              "Content-Length": file.size.toString(),
            }
          });
        }
        
        // Parse range header like "bytes=0-1023"
        const match = range.match(/bytes=(\d+)-(\d*)/);
        if (!match) {
          return new Response(file, {
            headers: {
              "Content-Type": "application/octet-stream",
              "Accept-Ranges": "bytes",
              "Content-Length": file.size.toString(),
            }
          });
        }
        
        const start = parseInt(match[1]);
        const end = match[2] ? parseInt(match[2]) : file.size - 1;
        
        return new Response(file.slice(start, end + 1), {
          status: 206,
          headers: {
            "Content-Type": "application/octet-stream",
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes ${start}-${end}/${file.size}`,
            "Content-Length": (end - start + 1).toString(),
          }
        });
      }
    }
  },
  development: {
    hmr: true,
    console: true,
  }
});

