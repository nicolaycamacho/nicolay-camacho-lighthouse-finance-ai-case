import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../src/app";
import { analyzeResponseSchema } from "../src/schemas/analyze";

const validRequest = {
  query: "Summarize close readiness for the UK entity.",
  analysis_type: "close_summary",
  entity_id: "uk_01",
  period: "2026-05"
};

describe("SSE analyze route", () => {
  it("POST /analyze?stream=true returns the expected event stream", async () => {
    const response = await request(app).post("/analyze?stream=true").send(validRequest).expect(200);
    const events = parseSseEvents(response.text);

    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(events.map((event) => event.event)).toEqual([
      "ack",
      "status",
      "status",
      "narrative_delta",
      "result",
      "done"
    ]);
    const ackEvent = eventAt(events, 0);
    const validationStatusEvent = eventAt(events, 1);
    const retrievalStatusEvent = eventAt(events, 2);
    const narrativeEvent = eventAt(events, 3);
    const resultEvent = eventAt(events, 4);
    const doneEvent = eventAt(events, 5);

    expect(ackEvent.data).toEqual({ run_id: expect.stringMatching(/^ana_/) });
    expect(validationStatusEvent.data).toEqual({ message: "request validated" });
    expect(retrievalStatusEvent.data).toEqual({ message: "retrieving deterministic finance context" });
    expect(narrativeEvent.data).toEqual({
      text: "Preparing close readiness summary from deterministic variance and blocker signals."
    });
    expect(analyzeResponseSchema.parse(resultEvent.data).run_id).toBe((ackEvent.data as { run_id: string }).run_id);
    expect(doneEvent.data).toEqual({ ok: true });
  });

  it("invalid streaming requests return 400 before SSE headers are committed", async () => {
    const response = await request(app)
      .post("/analyze?stream=true")
      .send({
        query: "",
        analysis_type: "variance"
      })
      .expect(400);

    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.text).not.toContain("event: ack");
    expect(response.body.error.type).toBe("validation_error");
  });

  it("uses neutral narrative progress before the final result", async () => {
    for (const analysisType of ["variance", "expense_exception"] as const) {
      const response = await request(app)
        .post("/analyze?stream=true")
        .send({
          ...validRequest,
          analysis_type: analysisType
        })
        .expect(200);
      const narrativeEvent = eventAt(parseSseEvents(response.text), 3);

      expect(narrativeEvent.data).toEqual({
        text:
          analysisType === "variance"
            ? "Preparing evidence-linked variance commentary after deterministic checks complete."
            : "Preparing exception triage and human-review next actions after deterministic checks complete."
      });
      expect(JSON.stringify(narrativeEvent.data)).not.toContain("Found ");
    }
  });
});

function parseSseEvents(text: string) {
  return text
    .trim()
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event: "));
      const dataLines = lines.filter((line) => line.startsWith("data: ")).map((line) => line.slice(6));

      if (!eventLine) {
        throw new Error(`SSE block is missing an event line: ${block}`);
      }

      return {
        event: eventLine.slice(7),
        data: JSON.parse(dataLines.join("\n")) as unknown
      };
    });
}

function eventAt(events: ReturnType<typeof parseSseEvents>, index: number) {
  const event = events[index];

  if (!event) {
    throw new Error(`Missing SSE event at index ${index}`);
  }

  return event;
}
