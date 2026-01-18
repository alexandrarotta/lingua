import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

function resolveDevHttps() {
  const configDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(configDir, "..");

  const defaultKey = path.join(repoRoot, "certs", "lingua-dev-key.pem");
  const defaultCert = path.join(repoRoot, "certs", "lingua-dev.pem");

  const keyPath = process.env.LINGUA_HTTPS_KEY?.trim() || defaultKey;
  const certPath = process.env.LINGUA_HTTPS_CERT?.trim() || defaultCert;

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
  }

  return undefined;
}

function serveSqlJsWasmFromAssets(): Plugin {
  return {
    name: "lingua-serve-sqljs-wasm-from-assets",
    apply: "serve",
    configureServer(server) {
      // Serve sql.js WASM from a stable URL (avoid `/@fs/...` absolute paths when deps are hoisted).
      const configDir = path.dirname(fileURLToPath(import.meta.url));
      const candidates = [
        path.resolve(configDir, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
        path.resolve(configDir, "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm")
      ];
      const wasmPath = candidates.find((p) => fs.existsSync(p));
      if (!wasmPath) {
        server.config.logger.warn("[lingua] sql.js wasm not found; /assets/sql-wasm.wasm will 404");
        return;
      }

      const wasmBytes = fs.readFileSync(wasmPath);
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (url !== "/assets/sql-wasm.wasm") return next();
        if (req.method !== "GET" && req.method !== "HEAD") return next();

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/wasm");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Content-Length", String(wasmBytes.length));
        if (req.method === "HEAD") return res.end();
        return res.end(wasmBytes);
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), serveSqlJsWasmFromAssets()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    https: resolveDevHttps(),
    proxy: {
      "/api": "http://localhost:8787"
    }
  },
  test: {
    environment: "jsdom"
  }
});
