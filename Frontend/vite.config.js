import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import * as esbuild from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const appIndexHtml = resolve(rootDir, "index.html");

/**
 * Inject only REACT_APP_* vars into the client bundle (same rule as CRA).
 * Never load the full .env — avoids leaking non-prefixed server secrets.
 */
function getCraClientEnvDefines(mode) {
  const env = loadEnv(mode, process.cwd(), "REACT_APP_");
  const defines = {
    "process.env.NODE_ENV": JSON.stringify(
      mode === "production" ? "production" : "development"
    ),
    "process.env.PUBLIC_URL": JSON.stringify(""),
  };

  Object.entries(env).forEach(([key, value]) => {
    defines[`process.env.${key}`] = JSON.stringify(value);
  });

  return defines;
}

export default defineConfig(({ mode }) => ({
  plugins: [
    {
      name: "treat-js-files-as-jsx",
      enforce: "pre",
      async transform(code, id) {
        if (!/\/src\/.*\.js$/.test(id)) return null;
        const result = esbuild.transformSync(code, {
          loader: "jsx",
          jsx: "automatic",
        });
        return {
          code: result.code,
          map: result.map || null,
        };
      },
    },
    react({ include: /\.(js|jsx|ts|tsx)$/ }),
  ],
  optimizeDeps: {
    entries: [appIndexHtml],
    esbuildOptions: {
      loader: {
        ".js": "jsx",
      },
    },
  },
  define: getCraClientEnvDefines(mode),
  // Extra guard: only REACT_APP_ would be exposed via import.meta.env if used later
  envPrefix: "REACT_APP_",
  publicDir: "public",
  build: {
    outDir: "build",
    emptyOutDir: true,
    rollupOptions: {
      input: appIndexHtml,
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    fs: {
      deny: [
        resolve(rootDir, "packages/spreadsheet"),
        resolve(rootDir, "build"),
      ],
    },
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@spreadsheet": resolve(rootDir, "packages/spreadsheet"),
      "@spreadsheet-wrapper": resolve(
        rootDir,
        "packages/spreadsheet-wrapper/src"
      ),
    },
  },
}));
