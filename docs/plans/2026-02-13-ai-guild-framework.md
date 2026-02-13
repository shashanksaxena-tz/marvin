# AI Guild Framework

**Created:** 2026-02-13
**Status:** Active
**Owner:** Shashank Saxena, Principal Architect

---

## 1. Purpose & Vision

The AI Guild is Taazaa's internal AI innovation lab. A small team of 4 engineers who build reusable AI tools, components, and templates for the broader organization. The learning is the byproduct of building - members grow their skills by shipping real artifacts that other teams can use.

**Vision:** Every Taazaa project starts with AI-ready tooling, and the team knows how to use it.

**Success criteria (3-month horizon):**
- Shipped artifacts that other Taazaa teams actually adopt
- Each member demonstrably leveled up and can independently lead AI work on client projects
- Guild output directly contributed to winning or delivering a client engagement

**Led by:** Shashank Saxena (Principal Architect)
**Check-in cadence:** Every 2 days
**Timeline:** Ongoing initiative with steady progress expected

---

## 2. Team & Areas of Focus

| Member | Area | What They're Building |
|--------|------|-----------------------|
| **Karan** | Open Code Evaluation | Testing whether open-source coding assistants (Continue.dev, Tabby, etc.) can replace GitHub Copilot across Taazaa. Benchmarking free-tier models like MiniMax 2.1, GLM-5, and others for code completion quality. |
| **Hrithik** | AI Agents for Dev Efficiency | Building AI agents through the SpecKit project that automate coding workflows - improving developer speed and reducing repetitive work. |
| **Ankur** | UI/Design Tooling | Exploring React component generation and pencil.dev integration for AI-assisted UI design - making it faster to go from design to code. |
| **Ashutosh** | Project Starter Templates | Creating production-ready boilerplate templates with structured logging, observability, database connections, migration scripts, JUnit plugin framework, and code style standards baked in. |

Each member owns their area end-to-end. They research, prototype, and deliver. Shashank sets direction, removes blockers, and reviews progress every 2 days.

**Cross-pollination:** The areas naturally feed into each other - Ashutosh's templates could include Karan's recommended AI model configs, Ankur's UI components could ship as part of the starter templates, and Hrithik's agents could accelerate all of the above.

---

## 3. KPIs & Progress Tracking

### Per-member metrics (reviewed every 2 days)

| Metric | How to Measure |
|--------|----------------|
| Deliverables shipped | Tangible outputs: benchmarks published, agents working, components built, templates usable |
| Blockers flagged | Are they stuck? Did they raise it or sit on it? |
| Knowledge shared | Did they document what they learned? Can someone else pick it up? |

---

### Karan - Open Code Evaluation (Milestones)

| # | Milestone | Description |
|---|-----------|-------------|
| K1 | Tool landscape research | Identify all viable open-source Copilot alternatives (Continue.dev, Tabby, Cody, Aider, Cursor OSS, etc.). Document what each does, IDE support, model compatibility. |
| K2 | Free model inventory | List all free-tier models available for code completion: MiniMax 2.1, GLM-5, CodeLlama, DeepSeek Coder, StarCoder, Qwen Coder, etc. Document rate limits, context windows, languages supported. |
| K3 | Evaluation framework | Define how to benchmark: what languages to test (Java, TypeScript, Python at minimum), what tasks (autocomplete, function generation, refactoring, test writing), scoring criteria (accuracy, latency, context awareness). |
| K4 | Single-model benchmarks | Run each free model through the evaluation framework independently. Raw results documented. |
| K5 | Tool + model combinations | Test the top 3 tools with the top 3 models. Find the best pairings. |
| K6 | Real-world pilot | One developer (could be Karan himself) uses the best combo for a full week on a real Taazaa project. Track productivity, frustrations, gaps. |
| K7 | Comparison vs Copilot | Side-by-side comparison: best open alternative vs GitHub Copilot on the same tasks. Honest assessment of where it wins, where it falls short. |
| K8 | Recommendation report | Final doc: "Can Taazaa switch?" with clear conditions (e.g., "Yes for Python/TS, not yet for Java" or "Yes if we self-host model X"). Cost savings analysis included. |
| K9 | Rollout guide | If the answer is yes - step-by-step guide for other Taazaa teams to set it up. IDE configs, model settings, troubleshooting. |
| K10 | Knowledge transfer | Present findings to the broader team. Workshop or recorded demo. |

---

### Hrithik - AI Agents for Dev Efficiency (Milestones)

| # | Milestone | Description |
|---|-----------|-------------|
| H1 | Agent landscape research | Survey existing AI agent frameworks: LangChain, CrewAI, AutoGen, Claude Code SDK, OpenClaw, custom. Evaluate which fits SpecKit's needs. Document trade-offs. |
| H2 | Use case mapping | Identify the top 5-10 repetitive developer tasks at Taazaa that agents could automate. Rank by time saved vs effort to build. |
| H3 | SpecKit agent v0 | First working prototype - pick the highest-impact use case and build an agent that handles it end-to-end. Even if rough. |
| H4 | Tool integration | Agent can interact with real dev tools: read/write files, run tests, query APIs, parse logs. Not just chat. |
| H5 | Multi-step workflow | Agent handles a task that requires 3+ sequential steps without human intervention (e.g., "read the ticket, find the relevant code, write the fix, run tests"). |
| H6 | Error recovery | Agent handles failures gracefully - retries, alternative approaches, knows when to ask for help instead of looping. |
| H7 | Time savings measurement | Run the agent on 5 real tasks. Measure time taken by agent vs a developer doing it manually. Document the delta. |
| H8 | Second use case | Build agent for use case #2 from the ranked list. Validates that the framework is reusable, not a one-off. |
| H9 | Developer testing | Another Taazaa dev (not Hrithik) uses the agent on their own project. Collect feedback on usability, reliability, trust. |
| H10 | Documentation & API | Full docs: what the agent does, how to configure it, how to extend it with new tools. Clear enough that someone unfamiliar can get it running in under 30 minutes. |
| H11 | Client project pitch | Package the agent capability into something presentable - could Taazaa offer "AI-assisted development" as a differentiator in client proposals? |
| H12 | Knowledge transfer | Demo to the guild + broader team. Walkthrough of architecture, lessons learned, what worked and what didn't. |

---

### Ankur - UI/Design Tooling (Milestones)

| # | Milestone | Description |
|---|-----------|-------------|
| A1 | Tool landscape research | Survey AI-assisted UI tools: pencil.dev, v0.dev, Galileo AI, Locofy, TeleportHQ, Builder.io. Document capabilities, pricing, output quality, framework support. |
| A2 | pencil.dev deep dive | Hands-on evaluation of pencil.dev specifically. What can it generate? How clean is the output code? Does it produce production-ready React or needs heavy cleanup? |
| A3 | Design-to-code workflow | Define the ideal workflow: designer hands off a design → AI tool generates components → developer refines. Map out where the gaps are today. |
| A4 | Component generation POC | Take 3 common UI patterns (form, dashboard card, data table) and generate them using the best tool. Compare output quality vs hand-coding. |
| A5 | React component library v0 | First batch of 5-8 reusable React components generated/refined through AI tooling. Properly typed, documented, with props interface. |
| A6 | Theming & customization | Components support theming - a project team can drop them in and apply their own brand colors, typography, spacing without rewriting. |
| A7 | Storybook integration | All components visible in Storybook with interactive examples, prop controls, and usage documentation. |
| A8 | Design system alignment | Components follow a consistent design system (spacing, typography scale, color tokens). Not just random pretty components. |
| A9 | Real project pilot | A Taazaa project team uses the component library on an actual client project. Track: time saved on UI, quality feedback from client, pain points. |
| A10 | Figma/design tool bridge | Can designers export from Figma → AI tool → React components in one flow? Test and document the pipeline. |
| A11 | Accessibility audit | All components meet WCAG 2.1 AA. Keyboard navigation, screen reader support, color contrast all passing. |
| A12 | Package & publish | Component library packaged as an internal npm package. Versioned, changelog, install docs. Any Taazaa team can `npm install` and go. |
| A13 | Knowledge transfer | Demo to guild + broader team. Show the design-to-code pipeline, component library, and real project results. |

---

### Ashutosh - Project Starter Templates (Milestones)

| # | Milestone | Description |
|---|-----------|-------------|
| S1 | Template landscape research | Survey existing starter templates and scaffolding tools: Spring Initializr, create-next-app, Yeoman, Cookiecutter, Nx generators. What's already out there that Taazaa could build on vs build from scratch? |
| S2 | Taazaa tech stack audit | Identify the top 3-4 tech stacks Taazaa uses most on client projects (e.g., Spring Boot + PostgreSQL, Next.js + MongoDB, etc.). Templates should cover these first. |
| S3 | Template architecture design | Define the template structure: folder layout, config file conventions, where custom code goes vs what's boilerplate. Decide monorepo vs standalone. |
| S4 | Database layer | Working DB connection setup with connection pooling, environment-based config (dev/staging/prod), and health checks. Support for at least 2 databases (e.g., PostgreSQL, MongoDB). |
| S5 | Migration framework | Database migrations baked in and working. Schema versioning, rollback support, seed data for local dev. Flyway/Liquibase for Java, Prisma/Knex for Node. |
| S6 | Structured logging | Logging framework configured out of the box. JSON structured logs, log levels, correlation IDs for request tracing. Not just console.log everywhere. |
| S7 | Observability stack | Metrics, tracing, and health endpoints pre-wired. OpenTelemetry integration, ready to plug into Datadog/Grafana/New Relic. Health check endpoint that reports DB, cache, external service status. |
| S8 | Testing framework | JUnit (Java) / Jest+Vitest (Node) configured with sensible defaults. Unit test examples, integration test setup with testcontainers or similar, coverage reporting wired in. |
| S9 | Code style & linting | ESLint/Prettier (JS/TS) or Checkstyle/SpotBugs (Java) pre-configured. EditorConfig for cross-IDE consistency. Pre-commit hooks that enforce standards automatically. |
| S10 | CI/CD pipeline template | GitHub Actions or GitLab CI template included. Build, test, lint, security scan, deploy stages. Works out of the box on a fresh repo. |
| S11 | Security baseline | Dependency scanning, secret detection (e.g., gitleaks), OWASP dependency check. Environment variable management with .env + validation. No hardcoded secrets possible. |
| S12 | Plugin/extension framework | Architecture that lets teams add capabilities without modifying core template. E.g., "add Redis caching" or "add S3 file uploads" as drop-in modules. |
| S13 | Documentation template | README template, API docs setup (Swagger/OpenAPI), architecture decision records (ADRs) folder, contribution guide. New developer can onboard from the README alone. |
| S14 | First real project pilot | A Taazaa team starts a new client project using the template. Track: setup time (target: under 30 minutes from clone to running app), issues hit, what was missing. |
| S15 | Iteration from feedback | Fix gaps found in the pilot. Add what was missing, remove what was unnecessary. Template should feel opinionated but not bloated. |
| S16 | Multi-stack support | At least 2 tech stack templates fully working and tested (e.g., Spring Boot + Java and Next.js + TypeScript). Shared conventions across both. |
| S17 | CLI scaffolding tool | Optional: a simple CLI that asks "What stack? What DB? Need auth?" and generates the right template with the right modules. Like create-react-app but for Taazaa. |
| S18 | Knowledge transfer | Demo to guild + broader team. Walkthrough of template architecture, how to use it, how to extend it, pilot results. |

---

## 4. Check-in Structure

### Every 2 days (async via MARVIN)

Each member provides a quick update answering 3 questions:
1. What did you ship or learn since last check-in?
2. What are you working on next?
3. Any blockers?

Shashank reviews and responds with direction, feedback, or unblocking help.

### Monthly guild review

All 4 members share progress in a group setting:
- Demo what you built (working software > slides)
- Cross-pollination: what from your area could help someone else's?
- Adjust milestones if priorities shifted

### How MARVIN tracks this

| What | Where | How |
|------|-------|-----|
| Member updates | Telegram voice notes / texts | MARVIN captures and files under each member's name |
| Milestone progress | `state/todos.md` | Each milestone is a trackable task with status |
| Blockers | Flagged in check-ins | MARVIN surfaces unresolved blockers at next session start |
| Decisions made | Session logs | Searchable history of what was decided and why |
| Artifacts shipped | Content folder or linked repos | MARVIN can reference and connect them to goals |

### Escalation rule

If a member misses 2 consecutive check-ins or a blocker sits unresolved for 4+ days, MARVIN flags it as a priority item in Shashank's briefing.

---

*This document is the single source of truth for the AI Guild. Updated as the guild evolves.*
