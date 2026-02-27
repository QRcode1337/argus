"""
PostGIS registration module.

After a COG is produced, this module inserts a record into the
weather_layers table so the Next.js frontend can discover it.
"""
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

import psycopg2
from psycopg2.extras import execute_values

from config import DATABASE_URL, TITILER_URL

log = logging.getLogger("argus.db")


def _get_connection():
    return psycopg2.connect(DATABASE_URL)


def register_layer(
    var_cfg: dict,
    cog_path: str,
    valid_time: datetime,
    run_time: datetime,
) -> Optional[int]:
    """
    Insert a weather_layer record for a newly produced COG.

    Returns the new row id, or None on failure.
    """
    path = Path(cog_path)
    # Build the TiTiler URL template for Cesium UrlTemplateImageryProvider.
    # TiTiler expects a tile matrix set id (WebMercatorQuad for slippy-map XYZ).
    colormap = _colormap_for(var_cfg["short_name"])
    tile_url = (
        f"{TITILER_URL}/cog/tiles/WebMercatorQuad/{{z}}/{{x}}/{{y}}.png"
        f"?url={cog_path}&colormap_name={colormap}&rescale=auto"
    )
    size_mb = path.stat().st_size / (1024 * 1024) if path.exists() else None

    # World bounding box as WKT polygon
    world_bbox = "POLYGON((-180 -90, 180 -90, 180 90, -180 90, -180 -90))"

    sql = """
        INSERT INTO weather_layers
            (name, variable, level, valid_time, run_time, bbox, cog_path, tile_url, file_size_mb)
        VALUES (%s, %s, %s, %s, %s, ST_GeomFromText(%s, 4326), %s, %s, %s)
        RETURNING id
    """
    params = (
        f"GFS {var_cfg['label']}",
        var_cfg["short_name"],
        var_cfg.get("level", ""),
        valid_time,
        run_time,
        world_bbox,
        cog_path,
        tile_url,
        size_mb,
    )

    try:
        conn = _get_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                row_id = cur.fetchone()[0]
        conn.close()
        log.info(f"Registered layer id={row_id}: {var_cfg['label']}")
        return row_id
    except psycopg2.Error as exc:
        log.error(f"Failed to register layer in PostGIS: {exc}")
        return None


def get_latest_layers() -> list[dict]:
    """
    Return the most recent COG record per variable.
    Used by the Next.js API route for the frontend.
    """
    sql = """
        SELECT DISTINCT ON (variable)
            id, name, variable, valid_time, tile_url, file_size_mb
        FROM weather_layers
        ORDER BY variable, valid_time DESC
    """
    try:
        conn = _get_connection()
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall()
        conn.close()
        return [
            {
                "id": r[0],
                "name": r[1],
                "variable": r[2],
                "valid_time": r[3].isoformat() if r[3] else None,
                "tile_url": r[4],
                "file_size_mb": float(r[5]) if r[5] else None,
            }
            for r in rows
        ]
    except psycopg2.Error as exc:
        log.error(f"Failed to query layers from PostGIS: {exc}")
        return []


def _colormap_for(short_name: str) -> str:
    """Map variable short names to TiTiler-compatible colormap names."""
    mapping = {
        "t2m":  "rdylbu_r",   # temperature: red=hot, blue=cold
        "u10":  "bwr",        # wind U component
        "v10":  "bwr",        # wind V component
    }
    return mapping.get(short_name, "viridis")
