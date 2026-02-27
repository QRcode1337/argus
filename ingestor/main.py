"""
Argus Ingestor — main entry point.
Runs on a cron schedule, fetching NOAA GFS data and converting to COG tiles.
"""
import logging
import time
import schedule
from datetime import datetime

from config import GFS_CRON, LOG_LEVEL, GFS_VARIABLES, TILES_DIR
from fetchers.noaa_gfs import fetch_latest_gfs
from processors.grib2_to_cog import grib2_to_cog
from db import register_layer

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("argus.ingestor")


def run_ingest() -> None:
    log.info("Starting GFS ingest cycle")
    run_time = datetime.utcnow()

    for var_cfg in GFS_VARIABLES:
        try:
            log.info(f"Fetching {var_cfg['label']} ...")
            grib_path = fetch_latest_gfs(var_cfg)
            if grib_path is None:
                log.warning(f"No GRIB2 downloaded for {var_cfg['label']}, skipping")
                continue

            log.info(f"Converting {grib_path} → COG ...")
            cog_path, valid_time = grib2_to_cog(grib_path, var_cfg, TILES_DIR)

            log.info(f"Registering in PostGIS: {cog_path}")
            register_layer(var_cfg, cog_path, valid_time, run_time)

            log.info(f"Done: {var_cfg['label']} → {cog_path}")
        except Exception as exc:
            log.error(f"Failed to ingest {var_cfg['label']}: {exc}", exc_info=True)

    log.info("Ingest cycle complete")


if __name__ == "__main__":
    log.info("Argus ingestor starting up")
    # Run immediately on startup, then on schedule
    run_ingest()
    schedule.every(6).hours.do(run_ingest)
    while True:
        schedule.run_pending()
        time.sleep(60)
