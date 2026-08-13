import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Intent } from "@/lib/types";
import messages from "../../../../../../../../../../messages/en/intent.json";
import { IntentCard } from "./IntentCard";

afterEach(cleanup);

const INTENT: Intent = {
  intent: "Add rate limiting to the public API endpoints.",
  in_scope: ["src/middleware/rate-limit.ts"],
  out_of_scope: ["auth", "billing"],
  confidence: "high",
  sources: [
    { type: "pr_title", ref: "Add rate limiting", status: "available" },
    { type: "spec", ref: "specs/rate-limit.md", status: "missing" },
  ],
  missing_context: ["spec specs/rate-limit.md could not be fetched"],
};

/**
 * A stateful fetch stub: GET returns the current stored intent, POST stores
 * `postBody` and returns it — so a subsequent GET (triggered by invalidation)
 * reflects the fresh value, exactly as the real API behaves.
 */
function stubFetch(getBody: Intent | null, postBody?: Intent) {
  let stored: Intent | null = getBody;
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") stored = postBody ?? INTENT;
    return { ok: true, status: 200, json: async () => stored } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ intent: messages }}>
        <IntentCard prId="pr-1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("IntentCard", () => {
  it("renders summary, in/out scope, confidence, sources and the missing-context warning", async () => {
    stubFetch(INTENT);
    renderCard();

    expect(
      await screen.findByText("Add rate limiting to the public API endpoints."),
    ).toBeInTheDocument();
    expect(screen.getByText("src/middleware/rate-limit.ts")).toBeInTheDocument();
    expect(screen.getByText("billing")).toBeInTheDocument();
    // confidence badge (interpolated message)
    expect(screen.getByText(/high confidence/i)).toBeInTheDocument();
    // the spec ref shows in both the source chip and the missing-context list.
    expect(screen.getAllByText(/specs\/rate-limit\.md/).length).toBeGreaterThan(0);
    expect(screen.getByRole("alert")).toHaveTextContent(/could not be fetched/i);
  });

  it("shows the empty state when no intent has been derived", async () => {
    stubFetch(null);
    renderCard();
    expect(await screen.findByText(messages.empty)).toBeInTheDocument();
  });

  it("Re-run fires the derive mutation (POST) and shows the fresh intent", async () => {
    const rederived: Intent = { ...INTENT, intent: "Re-derived intent.", confidence: "medium" };
    const fetchMock = stubFetch(null, rederived);
    renderCard();

    // Empty first (GET → null), then Re-run.
    await screen.findByText(messages.empty);
    fireEvent.click(screen.getByRole("button", { name: /re-derive the pr intent/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/pulls/pr-1/intent"),
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(await screen.findByText("Re-derived intent.")).toBeInTheDocument();
  });
});
