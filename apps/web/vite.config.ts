import react from "@vitejs/plugin-react";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "precache-application-shell",
      apply: "build",
      async writeBundle(options, bundle) {
        const output = options.dir ?? "dist";
        const precache = ["./", "./index.html", ...Object.values(bundle)
          .filter((item) => item.fileName.startsWith("assets/"))
          .map((item) => `/${item.fileName}`)];
        const worker = resolve(output, "service-worker.js");
        const source = await readFile(worker, "utf8");
        await writeFile(
          worker,
          source.replace(
            '["./", "./index.html"]',
            JSON.stringify(precache)
          )
        );
      }
    }
  ]
});
