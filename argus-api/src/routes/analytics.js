const express = require("express");
const db = require("../db");

const router = express.Router();

const LAYER_DEFS = [
  { id: 1, name: "GFS Temperature 2m", variable: "t2m" },
  { id: 2, name: "GFS Wind U 10m", variable: "u10" },
  { id: 3, name: "GFS Wind V 10m", variable: "v10" },
];

router.get("/layers", async (_req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT DISTINCT ON (variable)
        variable, valid_time, tile_url, cog_path as source_file
      FROM weather_layers
      ORDER BY variable, valid_time DESC;
    `);

    const rasterData = rows.reduce((acc, row) => {
      acc[row.variable] = row;
      return acc;
    }, {});

    const layers = LAYER_DEFS.map((def) => {
      const data = rasterData[def.variable];

      if (!data) {
        return {
          ...def,
          valid_time: null,
          tile_url: null,
          source_file: null,
          error: "No raster file found in database yet.",
        };
      }

      return {
        ...def,
        valid_time: data.valid_time,
        tile_url: data.tile_url,
        source_file: data.source_file,
        error: null,
      };
    });

    const countRes = await db.query('SELECT COUNT(*) FROM weather_layers');
    const available_file_count = parseInt(countRes.rows[0].count, 10);

    return res.json({
      layers,
      available_file_count,
    });
  } catch (error) {
    console.error("Error fetching layers:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
