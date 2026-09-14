# Maintaining agent guidance

This repository applies the recommendations in OpenAI's
[Rethinking skills and prompts for GPT-6 Astra](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra):
keep always-loaded instructions small, route to relevant references, and define
completion without prescribing every implementation step.

`AGENTS.md` owns repository constraints and reference routing. `CLAUDE.md` imports
it so there is one policy source. Setup belongs in the README, check selection in
`testing.md`, rollout contracts in `releases.md`, and domain details in
`backend.md` or `CONTEXT.md`. Preserve the Next.js-generated instruction block.

Add guidance for a concrete repository hazard or recurring failure. Prefer a
scoped instruction with a reason; remove superseded rules and link to the owning
document instead of duplicating them. If a reusable workflow needs a skill, give
it a short, precise trigger and keep optional detail in supporting references.
Do not add a skill merely to restate normal coding practice.

Evaluate revisions on representative tasks: a Markdown fix, a UI change, and a
migration review. Check that agents find the necessary context, complete the
requested work, and preserve permissions and release gates without unnecessary
reading or checks. These are review scenarios, not proof of model performance;
revise guidance when actual task outcomes expose a gap.
