import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useSkillVersions: () => ({ data: [], isLoading: false }),
  useRestoreSkillVersion: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillEditor } from "./SkillEditor";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "test-coverage-rubric",
  description: "Flag missing branch coverage.",
  type: "rubric",
  source: "manual",
  body: "## Rubric\nFlag missing branch coverage.",
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("L02 Skill Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save skill")).toBeInTheDocument();
  });

  it("renders the Preview tab's rendered body", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="preview" onTab={() => {}} />);
    expect(screen.getByText("Rendered as the reviewing agent receives it")).toBeInTheDocument();
    expect(screen.getByText(/Flag missing branch coverage/)).toBeInTheDocument();
  });

  it("renders the Versions tab's empty state when there are no earlier versions", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="versions" onTab={() => {}} />);
    expect(screen.getByText("No earlier versions yet.")).toBeInTheDocument();
  });
});
