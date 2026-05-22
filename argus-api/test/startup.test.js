const test = require("node:test");
const assert = require("node:assert/strict");

const { createServer, getCorsOrigins } = require("../src/server");

test("getCorsOrigins trims values and drops empties", () => {
  assert.deepEqual(getCorsOrigins(" https://a.example , ,https://b.example  "), [
    "https://a.example",
    "https://b.example",
  ]);
});

test("createServer builds a healthy app without throwing", async () => {
  const { server } = createServer({
    corsOrigin: "https://argusweb.bond, https://www.argusweb.bond",
  });

  await new Promise((resolve, reject) => {
    server.listen(0, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");

  const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "argus-api" });

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});
