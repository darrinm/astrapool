// Local-only receiver for browser-rendered frames. Run beside Vite on port 5173.
import http from "node:http";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./render/", import.meta.url));
const origin = "http://127.0.0.1:5173";
await mkdir(`${root}frames`, { recursive: true });
const server = http.createServer(async (req, res) => {
  if (req.headers.origin !== origin) {
    res.writeHead(403).end();
    return;
  }
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  const frame = /^\/frame\/(\d{5})$/.exec(req.url);
  if (req.method !== "POST" || (!frame && req.url !== "/complete")) {
    res.writeHead(404).end();
    return;
  }
  try {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) {
        res.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const data = Buffer.concat(chunks);
    const path = frame
      ? `${root}frames/${frame[1]}.jpg`
      : `${root}capture.json`;
    if (!frame) {
      const manifest = JSON.parse(data.toString("utf8"));
      if (
        !Number.isInteger(manifest.frames) ||
        manifest.frames < 1 ||
        manifest.fps !== 30
      ) {
        res.writeHead(400).end("Invalid capture manifest");
        return;
      }
    }
    await writeFile(`${path}.tmp`, data);
    await rename(`${path}.tmp`, path);
    if (!frame || Number(frame[1]) % 300 === 0)
      console.log(frame ? `Frame ${frame[1]}` : "Capture complete");
    res.end("ok");
  } catch (error) {
    console.error(error);
    res.writeHead(500).end("Capture could not be saved");
  }
});
server.on("error", (error) => {
  console.error(`Capture receiver: ${error.message}`);
  process.exitCode = 1;
});
server.listen(5174, "127.0.0.1", () =>
  console.log(`Writing trailer frames to ${root}`),
);
