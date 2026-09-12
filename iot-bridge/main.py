"""
Argus IoT Bridge — MQTT → TimescaleDB.

Subscribes to `iot/{device_id}/{metric}/data` and writes readings into the
`iot_readings` hypertable, also upserting device rows in `iot_devices`.

Payload (JSON, UTF-8):
    {"value": 21.4, "unit": "C", "name": "Rooftop Node", "lat": 40.71, "lon": -74.00, "meta": {...}}
"""
import json
import logging
import os
import signal
import sys
import threading
import time
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
import psycopg2
import psycopg2.extras

MQTT_HOST = os.getenv("MQTT_HOST", "iot-broker")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER", "argus-bridge")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "")
DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://argus:argus_dev@pgbouncer:5432/argus"
)
TOPIC = "iot/+/+/data"
REGISTER_TOPIC = "iot/+/register"
FLUSH_INTERVAL_S = float(os.getenv("FLUSH_INTERVAL_S", "5"))
MAX_BUFFER = int(os.getenv("MAX_BUFFER", "500"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("argus.iot_bridge")

_reading_buffer: list[tuple] = []
_buffer_lock = threading.Lock()
# latest device identity per device_id, merged into iot_devices on flush
_device_meta: dict[str, dict] = {}


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS iot_devices (
  id             SERIAL PRIMARY KEY,
  device_id      VARCHAR(80)   NOT NULL UNIQUE,
  name           VARCHAR(120),
  description    TEXT,
  location       GEOMETRY(POINT, 4326),
  meta           JSONB         DEFAULT '{}'::jsonb,
  last_seen      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS iot_readings (
  time       TIMESTAMPTZ   NOT NULL,
  device_id  VARCHAR(80)   NOT NULL,
  metric     VARCHAR(60)   NOT NULL,
  value      DOUBLE PRECISION NOT NULL,
  unit       VARCHAR(20),
  meta       JSONB         DEFAULT '{}'::jsonb
);

SELECT create_hypertable('iot_readings', 'time',
       chunk_time_interval => INTERVAL '1 day',
       migrate_data => true,
       if_not_exists => true);

CREATE INDEX IF NOT EXISTS idx_iot_readings_device_metric_time
  ON iot_readings (device_id, metric, time DESC);
CREATE INDEX IF NOT EXISTS idx_iot_devices_last_seen ON iot_devices (last_seen DESC);
"""


def ensure_schema() -> None:
    while True:
        try:
            conn = psycopg2.connect(DATABASE_URL)
            with conn:
                with conn.cursor() as cur:
                    cur.execute(SCHEMA_SQL)
            conn.close()
            log.info("Schema ensured (iot_devices, iot_readings hypertable)")
            return
        except psycopg2.Error as exc:
            log.error(f"Schema setup failed: {exc}; retrying in 30s")
            time.sleep(30)


def flush_buffer() -> None:
    with _buffer_lock:
        batch = _reading_buffer[:]
        _reading_buffer.clear()
    if not batch:
        return
    device_ids = {r[1] for r in batch}
    device_rows = []
    for dev_id in device_ids:
        last_ts = max(r[0] for r in batch if r[1] == dev_id)
        meta = _device_meta.get(dev_id, {})
        device_rows.append(
            {
                "device_id": dev_id,
                "name": meta.get("name"),
                "description": meta.get("description"),
                "location": meta.get("location"),
                "meta": json.dumps(meta.get("meta") or {}),
                "last_seen": last_ts,
            }
        )
    try:
        conn = psycopg2.connect(DATABASE_URL)
        with conn:
            with conn.cursor() as cur:
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO iot_readings (time, device_id, metric, value, unit, meta)
                    VALUES %s
                    """,
                    [(r[0], r[1], r[2], r[3], r[4], json.dumps(r[5] or {})) for r in batch],
                )
                for row in device_rows:
                    cur.execute(
                        """
                        INSERT INTO iot_devices (device_id, name, description, location, meta, last_seen)
                        VALUES (%(device_id)s, %(name)s, %(description)s, %(location)s, %(meta)s::jsonb, %(last_seen)s)
                        ON CONFLICT (device_id) DO UPDATE SET
                          name = COALESCE(excluded.name, iot_devices.name),
                          description = COALESCE(excluded.description, iot_devices.description),
                          location = COALESCE(excluded.location, iot_devices.location),
                          meta = iot_devices.meta || excluded.meta,
                          last_seen = excluded.last_seen
                        """,
                        row,
                    )
        conn.close()
        log.info(f"Flushed {len(batch)} reading(s), {len(device_rows)} device(s)")
    except psycopg2.Error as exc:
        log.error(f"Flush failed: {exc}; re-queuing {len(batch)} reading(s)")
        with _buffer_lock:
            _reading_buffer[0:0] = batch


def _location_wkt(payload: dict) -> str | None:
    lat, lon = payload.get("lat"), payload.get("lon")
    if lat is None or lon is None:
        return None
    try:
        return f"POINT({float(lon)} {float(lat)})"
    except (TypeError, ValueError):
        return None


def on_connect(client, _userdata, _flags, rc, _props=None):
    if rc == 0:
        log.info(f"Connected to MQTT ({MQTT_HOST}:{MQTT_PORT})")
        client.subscribe(TOPIC, qos=1)
        client.subscribe(REGISTER_TOPIC, qos=1)
        log.info(f"Subscribed to {TOPIC} and {REGISTER_TOPIC}")
    else:
        log.error(f"MQTT connect failed rc={rc}")


def on_disconnect(_client, _userdata, rc, _props=None):
    log.warning(f"MQTT disconnected rc={rc}; reconnecting (backoff active)")


def on_message(_client, _userdata, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
        parts = msg.topic.split("/")
        if len(parts) == 3 and parts[2] == "register":
            _register_device(parts[1], payload)
            return
        if len(parts) != 4 or parts[3] != "data":
            return
        device_id, metric = parts[1], parts[2]
        value = float(payload["value"])
        unit = payload.get("unit")
        meta = payload.get("meta") or {}
        ts = datetime.now(timezone.utc)

        with _buffer_lock:
            _reading_buffer.append((ts, device_id, metric, value, unit, meta))
            dev = _device_meta.setdefault(
                device_id,
                {"name": None, "description": None, "location": None, "meta": {}},
            )
            if payload.get("name") is not None:
                dev["name"] = payload["name"]
            if payload.get("description") is not None:
                dev["description"] = payload["description"]
            dev_loc = _location_wkt(payload)
            if dev_loc is not None:
                dev["location"] = dev_loc
            if payload.get("meta"):
                dev["meta"] = {**dev["meta"], **payload["meta"]}
            overflow = len(_reading_buffer) >= MAX_BUFFER
        if overflow:
            threading.Thread(target=flush_buffer, daemon=True).start()
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        log.warning(f"Dropping malformed message on {msg.topic}: {exc}")


def _register_device(device_id: str, payload: dict) -> None:
    """Apply identity/registration metadata immediately (device calls this on boot)."""
    with _buffer_lock:
        dev = _device_meta.setdefault(
            device_id,
            {"name": None, "description": None, "location": None, "meta": {}},
        )
        if payload.get("name") is not None:
            dev["name"] = payload["name"]
        if payload.get("description") is not None:
            dev["description"] = payload["description"]
        dev_loc = _location_wkt(payload)
        if dev_loc is not None:
            dev["location"] = dev_loc
        if payload.get("meta"):
            dev["meta"] = {**dev["meta"], **payload["meta"]}
        ts = datetime.now(timezone.utc)
    try:
        conn = psycopg2.connect(DATABASE_URL)
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO iot_devices (device_id, name, description, location, meta, last_seen)
                    VALUES (%s, %s, %s, %s, %s::jsonb, %s)
                    ON CONFLICT (device_id) DO UPDATE SET
                      name = COALESCE(excluded.name, iot_devices.name),
                      description = COALESCE(excluded.description, iot_devices.description),
                      location = COALESCE(excluded.location, iot_devices.location),
                      meta = iot_devices.meta || excluded.meta,
                      last_seen = excluded.last_seen
                    """,
                    (
                        device_id,
                        dev["name"],
                        dev["description"],
                        dev["location"],
                        json.dumps(dev["meta"]),
                        ts,
                    ),
                )
        conn.close()
        log.info(f"Registered device {device_id}")
    except psycopg2.Error as exc:
        log.error(f"Device registration failed for {device_id}: {exc}")


def main() -> None:
    ensure_schema()

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="argus-iot-bridge")
    client.username_pw_set(MQTT_USER, MQTT_PASSWORD)
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message
    client.reconnect_delay_set(min_delay=1, max_delay=30)

    stop = threading.Event()

    def _signal_handler(_signum, _frame):
        stop.set()

    signal.signal(signal.SIGTERM, _signal_handler)
    signal.signal(signal.SIGINT, _signal_handler)

    client.connect_async(MQTT_HOST, MQTT_PORT)
    client.loop_start()

    while not stop.is_set():
        time.sleep(FLUSH_INTERVAL_S)
        flush_buffer()

    flush_buffer()
    client.loop_stop()
    sys.exit(0)


if __name__ == "__main__":
    main()