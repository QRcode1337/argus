const { createClient } = require("redis");
const client = createClient({ url: process.env.REDIS_URL || "redis://redis:6379" });
client.on("error", (err) => console.error("Redis Client Error", err));
client.connect().catch(console.error);
module.exports = client;
