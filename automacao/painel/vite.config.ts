import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  base: "/painel/",
  build: {
    outDir: fileURLToPath(new URL("../painel-dist", import.meta.url)),
    emptyOutDir: true,
  },
});
