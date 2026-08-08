import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/conventions.json";
import type { ConventionCandidate } from "@/lib/types";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  scan_id: "s1",
  rule: "All Redis access goes through src/lib/redis.ts",
  category: "structure",
  status: "pending",
  source: "model",
  evidence_path: "src/lib/redis.ts",
  evidence_start_line: 1,
  evidence_end_line: 10,
  evidence_snippet: "export const redis = new Redis();",
  verification: "pattern",
  support_count: 12,
  violation_count: 0,
  confidence: 0.92,
  accepted: false,
  created_at: "2026-08-08T00:00:00Z",
  updated_at: "2026-08-08T00:00:00Z",
};

function renderCard(candidate: ConventionCandidate, handlers: Partial<Record<"onAccept" | "onReject" | "onSaveRule", ReturnType<typeof vi.fn>>> = {}) {
  const onAccept = handlers.onAccept ?? vi.fn();
  const onReject = handlers.onReject ?? vi.fn();
  const onSaveRule = handlers.onSaveRule ?? vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard candidate={candidate} onAccept={onAccept} onReject={onReject} onSaveRule={onSaveRule} />
    </NextIntlClientProvider>,
  );
  return { onAccept, onReject, onSaveRule };
}

describe("ConventionCard (smoke)", () => {
  it("renders the rule, evidence location, and confidence", () => {
    renderCard(CANDIDATE);
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    expect(screen.getByText("src/lib/redis.ts:1-10")).toBeInTheDocument();
    expect(screen.getByText("92% conf")).toBeInTheDocument();
  });

  it("Accept/Reject fire their callbacks for a pending candidate", () => {
    const { onAccept, onReject } = renderCard(CANDIDATE);
    fireEvent.click(screen.getByText(messages.card.accept));
    expect(onAccept).toHaveBeenCalled();
    fireEvent.click(screen.getByText(messages.card.reject));
    expect(onReject).toHaveBeenCalled();
  });

  it("click-to-edit: Save calls onSaveRule with the edited text, Cancel discards it", () => {
    const { onSaveRule } = renderCard(CANDIDATE);
    fireEvent.click(screen.getByText(CANDIDATE.rule));
    const textarea = screen.getByPlaceholderText(CANDIDATE.rule) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Edited rule text" } });
    fireEvent.click(screen.getByText(messages.card.save));
    expect(onSaveRule).toHaveBeenCalledWith("Edited rule text");
  });

  it("Cancel discards the edit without calling onSaveRule", () => {
    const { onSaveRule } = renderCard(CANDIDATE);
    fireEvent.click(screen.getByText(CANDIDATE.rule));
    const textarea = screen.getByPlaceholderText(CANDIDATE.rule) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Something else" } });
    fireEvent.click(screen.getByText(messages.card.cancel));
    expect(onSaveRule).not.toHaveBeenCalled();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
  });

  it("an accepted candidate shows the Accepted badge, and Reject truly rejects it", () => {
    const { onReject } = renderCard({ ...CANDIDATE, status: "accepted" });
    expect(screen.getByText(messages.card.accepted)).toBeInTheDocument();
    fireEvent.click(screen.getByText(messages.card.reject));
    expect(onReject).toHaveBeenCalled();
  });

  it("a rejected candidate's Accept button truly accepts it", () => {
    const { onAccept } = renderCard({ ...CANDIDATE, status: "rejected" });
    fireEvent.click(screen.getByText(messages.card.accept));
    expect(onAccept).toHaveBeenCalled();
  });

  it("a config-sourced candidate shows the config verification chip", () => {
    renderCard({ ...CANDIDATE, source: "config", verification: "config", confidence: 1 });
    expect(screen.getByText(messages.card.verification.config)).toBeInTheDocument();
  });
});
