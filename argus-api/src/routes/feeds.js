const express = require("express");

const router = express.Router();

async function proxyUpstream(res, upstream, options = {}) {
  const { contentType = "application/json", headers = {} } = options;

  try {
    const response = await fetch(upstream, {
      cache: "no-store",
      headers,
    });
    const body = await response.text();

    res.status(response.status);
    res.type(contentType);
    return res.send(body);
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : "Upstream proxy failed",
    });
  }
}

router.get("/opensky", async (_req, res) => {
  const upstream = process.env.OPENSKY_ENDPOINT ?? "https://opensky-network.org/api/states/all";
  await proxyUpstream(res, upstream, {
    contentType: "application/json",
    headers: {
      Accept: "application/json",
    },
  });
});

router.get("/adsb-military", async (_req, res) => {
  const upstream = process.env.ADSB_MIL_ENDPOINT ?? "https://api.adsb.lol/v2/mil";
  const headers = {
    Accept: "application/json",
  };

  if (process.env.ADSB_MIL_API_KEY) {
    headers.Authorization = `Bearer ${process.env.ADSB_MIL_API_KEY}`;
  }

  await proxyUpstream(res, upstream, {
    contentType: "application/json",
    headers,
  });
});

router.get("/usgs", async (_req, res) => {
  const upstream =
    process.env.USGS_ENDPOINT ??
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
  await proxyUpstream(res, upstream, {
    contentType: "application/json",
    headers: {
      Accept: "application/json",
    },
  });
});

router.get("/celestrak", async (_req, res) => {
  const upstream =
    process.env.CELESTRAK_ENDPOINT ??
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle";
  await proxyUpstream(res, upstream, {
    contentType: "text/plain; charset=utf-8",
  });
});

router.get("/tfl-cctv", async (_req, res) => {
  const upstream = process.env.CCTV_TFL_ENDPOINT ?? "https://api.tfl.gov.uk/Place/Type/JamCam";
  await proxyUpstream(res, upstream, {
    contentType: "application/json",
    headers: {
      Accept: "application/json",
    },
  });
});

module.exports = router;
