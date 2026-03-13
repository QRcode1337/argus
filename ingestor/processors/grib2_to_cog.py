"""
GRIB2 → Cloud-Optimised GeoTIFF processor.

Reads a single-variable GRIB2 file (produced by the NOAA fetcher),
reprojects to EPSG:4326, and writes a COG that TiTiler can serve.
"""
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
import xarray as xr

log = logging.getLogger("argus.processor.grib2_to_cog")

# COG creation options for rasterio
_COG_PROFILE = {
    "driver": "GTiff",
    "dtype": "float32",
    "crs": CRS.from_epsg(4326),
    "compress": "deflate",
    "predictor": 3,        # floating point predictor
    "tiled": True,
    "blockxsize": 512,
    "blockysize": 512,
    "interleave": "band",
    "copy_src_overviews": True,
}

_OVERVIEW_LEVELS = [2, 4, 8, 16, 32]


def _parse_valid_time(ds: xr.Dataset) -> datetime:
    """Extract valid_time from the xarray dataset."""
    if "valid_time" in ds.coords:
        vt = ds.coords["valid_time"].values
        # numpy datetime64 → Python datetime
        ts = (vt - np.datetime64("1970-01-01T00:00:00")) / np.timedelta64(1, "s")
        return datetime.fromtimestamp(float(ts), tz=timezone.utc)
    return datetime.now(tz=timezone.utc)


def grib2_to_cog(
    grib_path: str,
    var_cfg: dict,
    output_dir: str,
) -> Tuple[str, datetime]:
    """
    Convert a GRIB2 file to a Cloud-Optimised GeoTIFF.

    Parameters
    ----------
    grib_path : str
        Path to the input GRIB2 file.
    var_cfg : dict
        Variable config dict from config.GFS_VARIABLES.
    output_dir : str
        Directory to write the COG into.

    Returns
    -------
    (cog_path, valid_time)
        Local path to the written COG, and the forecast valid time.
    """
    short_name = var_cfg["short_name"]
    stem = Path(grib_path).stem  # e.g. gfs_t2m_20260226_00z
    out_path = Path(output_dir) / f"{stem}.tif"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    log.info(f"Opening GRIB2: {grib_path}")
    # cfgrib needs eccodes; open with squeeze=True to drop size-1 dims
    # cfgrib/xarray compatibility varies by version:
    # some builds reject backend_kwargs.indexing_kwargs.
    # Try modern/default open first, then fall back for older variants.
    try:
        ds = xr.open_dataset(
            grib_path,
            engine="cfgrib",
            squeeze=True,
        )
    except TypeError:
        ds = xr.open_dataset(
            grib_path,
            engine="cfgrib",
            backend_kwargs={},
            squeeze=True,
        )

    valid_time = _parse_valid_time(ds)

    # Pick the first data variable (there should only be one per filtered file)
    data_var = list(ds.data_vars)[0]
    data: np.ndarray = np.asarray(ds[data_var].values, dtype=np.float32)
    # Some cfgrib/xarray combinations keep singleton dims (time/step/surface).
    # Normalize to a 2D lat/lon raster.
    data = np.squeeze(data)
    if data.ndim > 2:
        # Keep the last 2 dims as spatial (lat, lon), drop leading singleton-ish axes.
        data = data.reshape((-1, data.shape[-2], data.shape[-1]))[0]

    # GFS data comes on a 0–360 lon grid; normalise to -180–180 for EPSG:4326
    lons = ds.coords["longitude"].values
    if lons.max() > 180:
        # Roll so longitudes go -180 to 180
        split = np.searchsorted(lons, 180)
        data = np.roll(data, -split, axis=-1)
        lons = np.where(lons > 180, lons - 360, lons)
        lons = np.roll(lons, -split)

    lats = ds.coords["latitude"].values
    # Ensure lats are descending (north → south) for rasterio north-up convention
    if lats[0] < lats[-1]:
        data = data[::-1] if data.ndim == 2 else data[:, ::-1, :]
        lats = lats[::-1]

    height, width = data.shape[-2], data.shape[-1]
    lon_min, lon_max = float(lons.min()), float(lons.max())
    lat_min, lat_max = float(lats.min()), float(lats.max())
    transform = from_bounds(lon_min, lat_min, lon_max, lat_max, width, height)

    # Replace GRIB2 fill values with NaN
    data = np.where(data > 9e20, np.nan, data)

    # Write temp file then add overviews → final COG
    tmp_path = out_path.with_suffix(".tmp.tif")
    profile = {
        **_COG_PROFILE,
        "width": width,
        "height": height,
        "count": 1,
        "transform": transform,
    }

    log.info(f"Writing temp GeoTIFF: {tmp_path}")
    with rasterio.open(tmp_path, "w", **profile) as dst:
        dst.write(data, 1)

    # Build overviews on the temp file
    log.info("Building overviews ...")
    with rasterio.open(tmp_path, "r+") as dst:
        dst.build_overviews(_OVERVIEW_LEVELS, Resampling.average)
        dst.update_tags(ns="rio_overview", resampling="average")

    # Copy to COG
    log.info(f"Writing COG: {out_path}")
    with rasterio.open(tmp_path) as src:
        with rasterio.open(out_path, "w", **{**profile, "copy_src_overviews": True}) as dst:
            dst.write(src.read())
            dst.update_tags(**src.tags())

    tmp_path.unlink(missing_ok=True)
    ds.close()

    size_mb = out_path.stat().st_size / (1024 * 1024)
    log.info(f"COG written: {out_path} ({size_mb:.1f} MB), valid_time={valid_time.isoformat()}")
    return str(out_path), valid_time
