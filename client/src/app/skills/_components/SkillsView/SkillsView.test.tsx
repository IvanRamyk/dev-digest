import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const SKILLS: Skill[] = [
  {
    id: "sk1",
    name: "test-coverage-rubric",
    description: "Flag missing branch coverage.",
    type: "rubric",
    source: "manual",
    body: "## Rubric",
    enabled: true,
    version: 1,
  },
];

const toggle = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: toggle }),
  useCreateSkill: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { SkillsView } from "./SkillsView";

afterEach(cleanup);

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillsView />
    </NextIntlClientProvider>,
  );
}

describe("SkillsView (smoke)", () => {
  it("lists seeded skills and navigates to the editor on click", () => {
    renderWithIntl();

    const card = screen.getByText("test-coverage-rubric");
    expect(card).toBeInTheDocument();

    fireEvent.click(card);
    expect(push).toHaveBeenCalledWith("/skills/sk1?tab=config");
  });
});
