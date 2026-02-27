"""
NOAA GFS fetcher — downloads latest GFS GRIB2 subsets from NOMADS.

Uses the NOMADS variable filter to download only the variables we need,
avoiding multi-GB full-resolution downloads.
"""
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import requests

from config import GFS_FILTER_URL, TILES_DIR

log = logging.getLogger("argus.fetcher.gfs")

# GFS runs 4 times per day at 00z, 06z, 12z, 18z
# Files appear ~3.5 hours after run time, so we fetch the run from ~4 hours ago
_RUN_HOURS = (0, 6, 12, 18)


def _latest_run_utc() -> tuple[str, str]:
    """Return (YYYYMMDD, HH) of the most recently available GFS run."""
    now = datetime.now(tz=timezone.utc)
    # Walk back through run hours to find the latest completed run
    for hours_back in range(0, 12):
        candidate = now - timedelta(hours=hours_back)
        # Round down to the nearest 6-hour boundary
        run_hour = (candidate.hour // 6) * 6
        date_str = candidate.strftime("%Y%m%d")
        hour_str = f"{run_hour:02d}"
        # Check if the index file exists (lightweight HEAD request)
        url = (
            f"https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/"
            f"gfs.{date_str}/{hour_str}/atmos/"
            f"gfs.t{hour_str}z.pgrb2.0p25.f000.idx"
        )
        try:
            resp = requests.head(url, timeout=10)
            if resp.status_code == 200:
                log.debug(f"Latest available GFS run: {date_str}/{hour_str}z")
                return date_str, hour_str
        except requests.RequestException:
            pass
    # Fallback: 24h ago
    fallback = now - timedelta(hours=24)
    return fallback.strftime("%Y%m%d"), "00"


def fetch_latest_gfs(var_cfg: dict) -> Optional[str]:
    """
    Download a single-variable GRIB2 subset for the latest GFS run.

    Parameters
    ----------
    var_cfg : dict
        From config.GFS_VARIABLES, e.g.
        {"var": "TMP", "level": "lev_2_m_above_ground", "short_name": "t2m", "label": "..."}

    Returns
    -------
    str | None
        Local path to the downloaded GRIB2 file, or None on failure.
    """
    date_str, hour_str = _latest_run_utc()
    short_name = var_cfg["short_name"]
    out_dir = Path(TILES_DIR) / "raw"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"gfs_{short_name}_{date_str}_{hour_str}z.grib2"

    if out_path.exists():
        log.info(f"GRIB2 already cached: {out_path}")
        return str(out_path)

    params = {
        "dir": f"/gfs.{date_str}/{hour_str}/atmos",
        "file": f"gfs.t{hour_str}z.pgrb2.0p25.f000",
        f"var_{var_cfg['var']}": "on",
        var_cfg["level"]: "on",
        "subregion": "",
        "toplat": "90",
        "leftlon": "0",
        "rightlon": "360",
        "bottomlat": "-90",
    }

    log.info(f"Downloading GFS {var_cfg['label']} for {date_str}/{hour_str}z ...")
    try:
        resp = requests.get(GFS_FILTER_URL, params=params, stream=True, timeout=120)
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "")
        if "html" in content_type.lower():
            log.error(f"NOMADS returned HTML (likely error page) for {var_cfg['label']}")
            return None

        with open(out_path, "wb") as fh:
            for chunk in resp.iter_content(chunk_size=1 << 16):
                fh.write(chunk)

        size_mb = out_path.stat().st_size / (1024 * 1024)
        log.info(f"Downloaded {out_path.name} ({size_mb:.1f} MB)")
        return str(out_path)

    except requests.RequestException as exc:
        log.error(f"Failed to download GFS {var_cfg['label']}: {exc}")
        if out_path.exists():
            out_path.unlink()
        return None
