import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../src/app";

const validRequest = {
  query: "Summarize close readiness for the UK entity.",
  analysis_type: "close_summary",
  entity_id: "uk_01",
  period: "2026-05"
};

describe("SSE analyze route", () => {
  it("POST /analyze?stream=true returns the expected event stream", async () => {
    const response = await request(app).post("/analyze?stream=true").send(validRequest).expect(200);

    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.text).toContain("event: ack");
    expect(response.text).toContain("event: result");
    expect(response.text).toContain("event: done");
  });
});
