import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://argus:argus_dev@localhost:5432/argus")
TILES_DIR = os.environ.get("TILES_DIR", "/data/tiles")
GFS_CRON = os.environ.get("GFS_CRON", "0 */6 * * *")  # every 6 hours
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")

# NOAA NOMADS base URL for GFS 0.25-degree
NOMADS_BASE = "https://nomads.ncep.noaa.gov"
GFS_FILTER_URL = f"{NOMADS_BASE}/cgi-bin/filter_gfs_0p25.pl"

# TiTiler base URL (for building tile_url strings stored in PostGIS)
TITILER_URL = os.environ.get("TITILER_URL", "http://titiler:80")

# Variables to ingest
GFS_VARIABLES = [
    {"var": "TMP",  "level": "lev_2_m_above_ground",  "short_name": "t2m",  "label": "Temperature 2m"},
    {"var": "UGRD", "level": "lev_10_m_above_ground", "short_name": "u10",  "label": "Wind U 10m"},
    {"var": "VGRD", "level": "lev_10_m_above_ground", "short_name": "v10",  "label": "Wind V 10m"},
]
