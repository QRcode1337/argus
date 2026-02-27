const fs = require("fs/promises");
const path = require("path");
const express = require("express");

const router = express.Router();

const TILE_ROOT = process.env.TILES_DIR || "/data/tiles";
const TITILER_BASE_PATH = process.env.TITILER_BASE_PATH || "/tiles";
const MAX_SCAN_DEPTH = 3;

const LAYER_DEFS = [
  { id: 1, name: "GFS Temperature 2m", variable: "t2m" },
  { id: 2, name: "GFS Wind U 10m", variable: "u10" },
  { id: 3, name: "GFS Wind V 10m", variable: "v10" },
];

const FILE_PRIORITY = [".tif", ".tiff", ".grib2", ".grb2"];

function getFilePriority(fileName) {
  const lower = fileName.toLowerCase();
  const idx = FILE_PRIORITY.findIndex((ext) => lower.endsWith(ext));
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

function inferVariable(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.includes("t2m")) return "t2m";
  if (lower.includes("u10")) return "u10";
  if (lower.includes("v10")) return "v10";
  return null;
}

function parseValidTime(fileName, fallbackTimeMs) {
  const match = fileName.match(/(\d{8})_(\d{2})z/i);
  if (!match) {
    return new Date(fallbackTimeMs).toISOString();
  }

  const [, yyyymmdd, hh] = match;
  const year = Number(yyyymmdd.slice(0, 4));
  const month = Number(yyyymmdd.slice(4, 6)) - 1;
  const day = Number(yyyymmdd.slice(6, 8));
  const hour = Number(hh);
  return new Date(Date.UTC(year, month, day, hour, 0, 0)).toISOString();
}

function buildTiTilerUrl(absPath) {
  return (
    `${TITILER_BASE_PATH}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png` +
    `?url=${encodeURIComponent(absPath)}` +
    "&colormap_name=rdylbu_r"
  );
}

async function scanRasterFiles(rootDir, maxDepth = MAX_SCAN_DEPTH) {
  const files = [];

  async function walk(dir, depth) {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath, depth + 1);
        continue;
      }

      if (!entry.isFile()) continue;
      if (getFilePriority(entry.name) === Number.MAX_SAFE_INTEGER) continue;

      try {
        const stats = await fs.stat(fullPath);
        files.push({
          absPath: fullPath,
          fileName: entry.name,
          mtimeMs: stats.mtimeMs,
          variable: inferVariable(entry.name),
          priority: getFilePriority(entry.name),
        });
      } catch {
        // Ignore files that disappear between readdir and stat.
      }
    }
  }

  await walk(rootDir, 0);

  files.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return b.mtimeMs - a.mtimeMs;
  });

  return files;
}

router.get("/layers", async (_req, res) => {
  const rasterFiles = await scanRasterFiles(TILE_ROOT);

  const latestAny = rasterFiles.length > 0 ? rasterFiles[0] : null;
  const layers = LAYER_DEFS.map((def) => {
    const latestForVariable =
      rasterFiles.find((file) => file.variable === def.variable) ?? latestAny;

    if (!latestForVariable) {
      return {
        ...def,
        valid_time: null,
        tile_url: null,
        source_file: null,
        error: "No raster file found under /data/tiles yet.",
      };
    }

    return {
      ...def,
      valid_time: parseValidTime(latestForVariable.fileName, latestForVariable.mtimeMs),
      tile_url: buildTiTilerUrl(latestForVariable.absPath),
      source_file: latestForVariable.absPath,
      error: null,
    };
  });

  return res.json({
    layers,
    available_file_count: rasterFiles.length,
  });
});

module.exports = router;
