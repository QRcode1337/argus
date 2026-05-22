const { createClient } = require("redis");

let clientPromise;

function getRedisClient() {
  if (!clientPromise) {
    const client = createClient({ url: process.env.REDIS_URL || "redis://redis:6379" });
    client.on("error", (err) => console.error("Redis Client Error", err));
    clientPromise = client.connect().then(() => client);
  }

  return clientPromise;
}

async function get(key) {
  const client = await getRedisClient();
  return client.get(key);
}

async function set(key, value, options) {
  const client = await getRedisClient();
  return client.set(key, value, options);
}

module.exports = {
  get,
  set,
  getRedisClient,
};
