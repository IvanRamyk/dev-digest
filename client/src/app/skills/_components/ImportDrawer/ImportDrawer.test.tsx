import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const previewMutateAsync = vi.fn();
const importMutateAsync = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  usePreviewImport: () => ({ mutateAsync: previewMutateAsync, isPending: false }),
  useImportSkill: () => ({ mutateAsync: importMutateAsync, isPending: false }),
}));

import { ImportDrawer } from "./ImportDrawer";

afterEach(cleanup);

function renderWithIntl(onClose = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ImportDrawer onClose={onClose} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ImportDrawer (smoke)", () => {
  it("previews an uploaded .md file, lists skipped entries from a preview, and saves only on click", async () => {
    previewMutateAsync.mockResolvedValue({
      name: "pr-quality-rubric",
      description: "Check test coverage before approving.",
      type: "rubric",
      body: "# pr-quality-rubric\nCheck test coverage before approving.",
      source: "extracted",
      skipped: [{ path: "install.sh", bytes: 20, reason: "not_processed" }],
    });

    const onClose = vi.fn();
    renderWithIntl(onClose);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["# pr-quality-rubric\nbody"], "pr-quality-rubric.md", {
      type: "text/markdown",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument());
    expect(screen.getByText("Not imported (1)")).toBeInTheDocument();
    expect(screen.getByText("install.sh")).toBeInTheDocument();

    // nothing saved until Save is clicked
    expect(importMutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Save skill"));
    await waitFor(() => expect(importMutateAsync).toHaveBeenCalled());
  });
});
