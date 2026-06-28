import type { Response } from "express";

export type SseEventType = "ack" | "status" | "narrative_delta" | "result" | "done" | "error";

export function setSseHeaders(res: Response) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
}

export function writeSseEvent(res: Response, event: SseEventType, data: unknown) {
  res.write(`event: ${event}\n`);

  const payload = JSON.stringify(data);
  for (const line of payload.split("\n")) {
    res.write(`data: ${line}\n`);
  }

  res.write("\n");
}
