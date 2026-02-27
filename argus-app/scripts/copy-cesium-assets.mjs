import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const source = path.join(projectRoot, "node_modules", "cesium", "Build", "Cesium");
const target = path.join(projectRoot, "public", "cesium");

if (!existsSync(source)) {
  console.warn("Cesium build assets were not found. Skipping asset copy.");
  process.exit(0);
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });

console.log(`Copied Cesium assets -> ${target}`);
