import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, Skill, AgentSkillLink } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import skillsMessages from "../../../../../../../../messages/en/skills.json";

const SKILLS: Skill[] = [
  { id: "s1", name: "test-coverage-rubric", description: "d", type: "rubric", source: "manual", body: "b", enabled: true, version: 1 },
  { id: "s2", name: "mocking-smells", description: "d", type: "convention", source: "manual", body: "b", enabled: true, version: 1 },
];
const LINKS: AgentSkillLink[] = [{ agent_id: "ag1", skill_id: "s1", order: 0 }];

const setSkillsMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgentSkills: () => ({ data: LINKS }),
  useSetAgentSkills: () => ({ mutate: setSkillsMutate }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(cleanup);

const AGENT = { id: "ag1", name: "Test Quality Reviewer" } as Agent;

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, skills: skillsMessages }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

describe("SkillsTab (smoke)", () => {
  it("shows the enabled count and links an unchecked skill on click", () => {
    renderWithIntl();

    expect(screen.getByText("1 of 2 enabled")).toBeInTheDocument();

    const unlinkedRow = screen.getByText("mocking-smells").closest("div")!;
    const checkbox = unlinkedRow.querySelector('[role="checkbox"]')!;
    fireEvent.click(checkbox);

    expect(setSkillsMutate).toHaveBeenCalledWith({ id: "ag1", skillIds: ["s1", "s2"] });
  });

  it("unlinking the only linked skill posts an empty ordered set", () => {
    renderWithIntl();

    const linkedRow = screen.getByText("test-coverage-rubric").closest("div")!.parentElement!;
    const checkbox = linkedRow.querySelector('[role="checkbox"]')!;
    fireEvent.click(checkbox);

    expect(setSkillsMutate).toHaveBeenCalledWith({ id: "ag1", skillIds: [] });
  });
});
