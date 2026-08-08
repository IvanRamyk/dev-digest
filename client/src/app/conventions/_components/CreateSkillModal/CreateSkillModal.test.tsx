import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/conventions.json";

const PREVIEW = {
  name: "payments-api-conventions",
  description: "House conventions extracted from acme/payments-api.",
  type: "convention" as const,
  body: "# acme/payments-api conventions\n\n- Rule one",
  candidate_count: 3,
};

const previewMutate = vi.fn((_vars: unknown, opts: { onSuccess: (dto: typeof PREVIEW) => void }) => {
  opts.onSuccess(PREVIEW);
});
vi.mock("@/lib/hooks/conventions", () => ({
  useConventionSkillPreview: () => ({ mutate: previewMutate, isPending: false }),
}));

const createSkillMutate = vi.fn((_vars: unknown, opts?: { onSuccess?: () => void }) => {
  opts?.onSuccess?.();
});
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: createSkillMutate, isPending: false }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

afterEach(() => {
  cleanup();
  previewMutate.mockClear();
  createSkillMutate.mockClear();
});

function renderModal(onCreated = vi.fn(), onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <CreateSkillModal repoId="r1" onClose={onClose} onCreated={onCreated} />
    </NextIntlClientProvider>,
  );
  return { onCreated, onClose };
}

describe("CreateSkillModal (smoke)", () => {
  it("prefills from the skill-preview response", async () => {
    renderModal();
    await waitFor(() => expect(screen.getByDisplayValue(PREVIEW.name)).toBeInTheDocument());
    expect(screen.getByDisplayValue(PREVIEW.description)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/# acme\/payments-api conventions/)).toBeInTheDocument();
  });

  it("Save carries the EDITED values, not the original preview", async () => {
    const { onCreated } = renderModal();
    await waitFor(() => expect(screen.getByDisplayValue(PREVIEW.name)).toBeInTheDocument());

    const nameInput = screen.getByDisplayValue(PREVIEW.name);
    fireEvent.change(nameInput, { target: { value: "edited-conventions" } });

    fireEvent.click(screen.getByText(messages.modal.save));

    await waitFor(() => expect(createSkillMutate).toHaveBeenCalled());
    const [payload] = createSkillMutate.mock.calls[0]!;
    expect(payload).toMatchObject({ name: "edited-conventions", type: "convention" });
    expect(onCreated).toHaveBeenCalled();
  });

  it("Cancel closes without ever calling createSkill", async () => {
    const { onClose } = renderModal();
    await waitFor(() => expect(screen.getByDisplayValue(PREVIEW.name)).toBeInTheDocument());

    fireEvent.click(screen.getByText(messages.modal.cancel));

    expect(createSkillMutate).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
