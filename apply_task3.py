import re

with open("/home/volta/argus/infra/db/init.sql", "a") as f:
    f.write("""

-- Continuous Aggregates (1 minute resolution) for Playback API

CREATE MATERIALIZED VIEW recorded_flights_1m WITH (timescaledb.continuous) AS
SELECT time_bucket('1 minute', ts) AS bucket,
       icao24,
       last(callsign, ts) as callsign,
       last(lon, ts) as lon,
       last(lat, ts) as lat,
       last(alt_m, ts) as alt_m,
       last(velocity, ts) as velocity,
       last(heading, ts) as heading,
       last(vertical_rate, ts) as vertical_rate,
       last(on_ground, ts) as on_ground,
       last(origin_country, ts) as origin_country,
       last(squawk, ts) as squawk
FROM recorded_flights
GROUP BY bucket, icao24;
SELECT add_continuous_aggregate_policy('recorded_flights_1m', start_offset => INTERVAL '1 hour', end_offset => INTERVAL '1 minute', schedule_interval => INTERVAL '1 minute');

CREATE MATERIALIZED VIEW recorded_military_1m WITH (timescaledb.continuous) AS
SELECT time_bucket('1 minute', ts) AS bucket,
       icao24,
       last(callsign, ts) as callsign,
       last(lon, ts) as lon,
       last(lat, ts) as lat,
       last(alt_m, ts) as alt_m,
       last(velocity, ts) as velocity,
       last(heading, ts) as heading,
       last(aircraft_type, ts) as aircraft_type
FROM recorded_military
GROUP BY bucket, icao24;
SELECT add_continuous_aggregate_policy('recorded_military_1m', start_offset => INTERVAL '1 hour', end_offset => INTERVAL '1 minute', schedule_interval => INTERVAL '1 minute');

CREATE MATERIALIZED VIEW recorded_satellites_1m WITH (timescaledb.continuous) AS
SELECT time_bucket('1 minute', ts) AS bucket,
       norad_id,
       last(name, ts) as name,
       last(lon, ts) as lon,
       last(lat, ts) as lat,
       last(alt_km, ts) as alt_km,
       last(tle_line1, ts) as tle_line1,
       last(tle_line2, ts) as tle_line2
FROM recorded_satellites
GROUP BY bucket, norad_id;
SELECT add_continuous_aggregate_policy('recorded_satellites_1m', start_offset => INTERVAL '1 hour', end_offset => INTERVAL '1 minute', schedule_interval => INTERVAL '1 minute');

CREATE MATERIALIZED VIEW recorded_quakes_1m WITH (timescaledb.continuous) AS
SELECT time_bucket('1 minute', ts) AS bucket,
       event_id,
       last(lon, ts) as lon,
       last(lat, ts) as lat,
       last(depth_km, ts) as depth_km,
       last(magnitude, ts) as magnitude,
       last(place, ts) as place
FROM recorded_quakes
GROUP BY bucket, event_id;
SELECT add_continuous_aggregate_policy('recorded_quakes_1m', start_offset => INTERVAL '1 hour', end_offset => INTERVAL '1 minute', schedule_interval => INTERVAL '1 minute');

CREATE MATERIALIZED VIEW recorded_outages_1m WITH (timescaledb.continuous) AS
SELECT time_bucket('1 minute', ts) AS bucket,
       location,
       cause,
       last(outage_type, ts) as outage_type,
       last(start_date, ts) as start_date,
       last(end_date, ts) as end_date,
       last(asn_name, ts) as asn_name
FROM recorded_outages
GROUP BY bucket, location, cause;
SELECT add_continuous_aggregate_policy('recorded_outages_1m', start_offset => INTERVAL '1 hour', end_offset => INTERVAL '1 minute', schedule_interval => INTERVAL '1 minute');

CREATE MATERIALIZED VIEW recorded_threats_1m WITH (timescaledb.continuous) AS
SELECT time_bucket('1 minute', ts) AS bucket,
       pulse_id,
       last(name, ts) as name,
       last(adversary, ts) as adversary,
       last(targeted_country, ts) as targeted_country,
       last(lon, ts) as lon,
       last(lat, ts) as lat
FROM recorded_threats
GROUP BY bucket, pulse_id;
SELECT add_continuous_aggregate_policy('recorded_threats_1m', start_offset => INTERVAL '1 hour', end_offset => INTERVAL '1 minute', schedule_interval => INTERVAL '1 minute');
""")

with open("/home/volta/argus/argus-api/src/routes/playback.js", "r") as f:
    playback = f.read()

# Update table names and ts fields in playback.js
playback = playback.replace("FROM recorded_flights", "FROM recorded_flights_1m")
playback = playback.replace("FROM recorded_military", "FROM recorded_military_1m")
playback = playback.replace("FROM recorded_satellites", "FROM recorded_satellites_1m")
playback = playback.replace("FROM recorded_quakes", "FROM recorded_quakes_1m")
playback = playback.replace("FROM recorded_outages", "FROM recorded_outages_1m")
playback = playback.replace("FROM recorded_threats", "FROM recorded_threats_1m")

# Change ts to bucket in the time window clause
playback = playback.replace("""
  WHERE ts BETWEEN $1::timestamptz - ($2 || ' seconds')::interval
                AND $1::timestamptz + ($2 || ' seconds')::interval""", """
  WHERE bucket BETWEEN time_bucket('1 minute', $1::timestamptz - ($2 || ' seconds')::interval)
                AND time_bucket('1 minute', $1::timestamptz + ($2 || ' seconds')::interval)""")

playback = playback.replace("ts DESC", "bucket DESC")

with open("/home/volta/argus/argus-api/src/routes/playback.js", "w") as f:
    f.write(playback)

print("Task 3 applied.")
