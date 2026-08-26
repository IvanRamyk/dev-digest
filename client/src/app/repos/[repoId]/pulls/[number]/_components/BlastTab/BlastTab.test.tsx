import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import blast from "../../../../../../../../messages/en/blast.json";
import { BlastTab } from "./BlastTab";

// Mock the data hook at the boundary — the component owns the fetch via usePrBlast.
const usePrBlast = vi.fn();
vi.mock("@/lib/hooks/blast", () => ({
  usePrBlast: (prId: string | null | undefined) => usePrBlast(prId),
}));

afterEach(() => {
  cleanup();
  usePrBlast.mockReset();
});

const REPO = "acme/payments-api";
const SHA = "headsha1234";

function fullMap(): BlastRadius {
  return {
    changed_symbols: [{ name: "chargeCard", file: "src/billing.ts", kind: "function" }],
    downstream: [
      {
        symbol: "chargeCard",
        callers: [{ name: "checkoutHandler", file: "src/checkout.ts", line: 42 }],
        endpoints_affected: ["POST /checkout"],
        crons_affected: ["nightly-reconcile"],
      },
    ],
    summary: "Changing chargeCard affects the checkout endpoint.",
    index_state: { status: "full", reason: null },
  };
}

function renderTab(prId: string | null = "pr-1") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast }}>
      <BlastTab prId={prId} repoFullName={REPO} headSha={SHA} />
    </NextIntlClientProvider>,
  );
}

describe("BlastTab", () => {
  it("renders a changed symbol, its caller count, a GitHub file:line link, and endpoint/cron chips", () => {
    usePrBlast.mockReturnValue({ data: fullMap(), isLoading: false, isError: false });
    renderTab();

    // The changed symbol and its caller count render.
    expect(screen.getByText("chargeCard")).toBeInTheDocument();
    expect(screen.getByText("1 callers")).toBeInTheDocument();

    // The caller file:line is a clickable link with the correct githubBlobUrl href.
    const link = screen.getByRole("link", { name: /open src\/checkout\.ts line 42 on github/i });
    expect(link).toHaveAttribute(
      "href",
      `https://github.com/${REPO}/blob/${SHA}/src/checkout.ts#L42`,
    );
    expect(within(link).getByText("src/checkout.ts:42")).toBeInTheDocument();

    // Endpoint chip (GET/POST) and cron chip render.
    expect(screen.getByText("POST /checkout")).toBeInTheDocument();
    expect(screen.getByText("nightly-reconcile")).toBeInTheDocument();
  });

  it("shows the degraded notice and keeps arrays empty (not hidden) when the index is degraded", () => {
    const degraded: BlastRadius = {
      changed_symbols: [],
      downstream: [],
      summary: "Impact could not be fully computed.",
      index_state: { status: "degraded", reason: "index_failed" },
    };
    usePrBlast.mockReturnValue({ data: degraded, isLoading: false, isError: false });
    renderTab();

    // The degraded/partial notice renders (role=alert), naming the incomplete state.
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/index for this repo is incomplete/i);
    expect(alert).toHaveTextContent(/index_failed/i);

    // Empty state is shown explicitly, not masked as "no impact".
    expect(
      screen.getByText(/No changed symbols were found in this PR's files\./i),
    ).toBeInTheDocument();
  });
});
