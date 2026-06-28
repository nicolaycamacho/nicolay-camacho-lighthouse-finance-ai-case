import "dotenv/config";

import { app } from "./app";
import { parsePort } from "./config";

const port = parsePort();

app.listen(port, () => {
  console.log(`lighthouse-finance-ai-case listening on port ${port}`);
});
