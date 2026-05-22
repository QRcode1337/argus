const { createServer } = require("./server");
const { startNewsCron } = require("./cron/news");

const port = Number(process.env.PORT || 3001);
const { server } = createServer();

server.listen(port, () => {
  console.log(`argus-api listening on port ${port}`);
});

startNewsCron();
