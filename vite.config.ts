/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveClipperFile(root: string, relativePath: string) {
  const resolved = path.resolve(root, relativePath);
  const clipperRoot = path.join(root, "clipper");

  if (
    resolved !== clipperRoot &&
    !resolved.startsWith(`${clipperRoot}${path.sep}`)
  ) {
    throw new Error(
      "Clipper file access is restricted to the clipper directory.",
    );
  }

  return resolved;
}

function clipperBrowserFilesystemBridge(): Plugin {
  return {
    name: "clipper-browser-filesystem-bridge",
    configureServer(server) {
      server.middlewares.use(
        "/__clipper_fs/read",
        async (request, response) => {
          try {
            const requestUrl = new URL(request.url ?? "", "http://localhost");
            const relativePath = requestUrl.searchParams.get("path");

            if (!relativePath) {
              response.statusCode = 400;
              response.end("Missing path.");
              return;
            }

            const content = await fs.readFile(
              resolveClipperFile(server.config.root, relativePath),
              "utf8",
            );
            response.setHeader("Content-Type", "text/plain; charset=utf-8");
            response.end(content);
          } catch (error) {
            response.statusCode = 500;
            response.end(
              error instanceof Error
                ? error.message
                : "Unable to read part file.",
            );
          }
        },
      );

      server.middlewares.use(
        "/__clipper_fs/write",
        async (request, response) => {
          if (request.method !== "POST") {
            response.statusCode = 405;
            response.end("Method not allowed.");
            return;
          }

          try {
            const requestUrl = new URL(request.url ?? "", "http://localhost");
            const relativePath = requestUrl.searchParams.get("path");

            if (!relativePath) {
              response.statusCode = 400;
              response.end("Missing path.");
              return;
            }

            const chunks: Buffer[] = [];
            for await (const chunk of request) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }

            const filePath = resolveClipperFile(
              server.config.root,
              relativePath,
            );
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(
              filePath,
              Buffer.concat(chunks).toString("utf8"),
              "utf8",
            );
            response.statusCode = 204;
            response.end();
          } catch (error) {
            response.statusCode = 500;
            response.end(
              error instanceof Error
                ? error.message
                : "Unable to save part file.",
            );
          }
        },
      );

      server.middlewares.use(
        "/__clipper_fs/list",
        async (request, response) => {
          if (request.method !== "GET") {
            response.statusCode = 405;
            response.end("Method not allowed.");
            return;
          }

          try {
            const requestUrl = new URL(request.url ?? "", "http://localhost");
            const relativePath = requestUrl.searchParams.get("path");

            if (!relativePath) {
              response.statusCode = 400;
              response.end("Missing path.");
              return;
            }

            const entries = await fs.readdir(
              resolveClipperFile(server.config.root, relativePath),
              { withFileTypes: true },
            );
            response.setHeader("Content-Type", "application/json");
            response.end(
              JSON.stringify(
                entries
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((entry) => ({
                    name: entry.name,
                    isDirectory: entry.isDirectory(),
                  })),
              ),
            );
          } catch (error) {
            response.statusCode = 500;
            response.end(
              error instanceof Error
                ? error.message
                : "Unable to list directory.",
            );
          }
        },
      );
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), clipperBrowserFilesystemBridge()],
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV ?? "production",
    ),
    "process.env.BABEL_TYPES_8_BREAKING": JSON.stringify(""),
    "process.env": "{}",
  },
  resolve: {
    alias: {
      "@clipper": path.resolve(__dirname, "clipper/projects"),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: [".temp/**", "node_modules/**", "dist/**", "dist-electron/**"],
  },
});
