import "dotenv/config";

import { app } from "./app";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);

app.listen(port, () => {
  console.log(`lighthouse-finance-ai-case listening on port ${port}`);
});
