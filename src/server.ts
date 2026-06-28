import "dotenv/config";

import { parsePort } from "./config";
import { createApp } from "./app";
import { createFinanceAnalyzer } from "./llm/createFinanceAnalyzer";

const port = parsePort();
const app = createApp(createFinanceAnalyzer());

app.listen(port, () => {
  console.log(`lighthouse-finance-ai-case listening on port ${port}`);
});
