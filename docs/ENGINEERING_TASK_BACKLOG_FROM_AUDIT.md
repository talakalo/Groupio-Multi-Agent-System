# Engineering Task Backlog from Deep Technical Audit

## 1. Executive Task Summary
- This backlog converts the audit findings into execution-ready work to move the backend from **local exploration quality** toward **controlled pilot** and then **production hardening**.
- Work is split into: **Critical blockers**, **Pilot readiness**, **Production hardening**, and **Documentation/DX alignment**.
- Prioritization follows the audited remediation order:
  1. remove import-time network dependency
  2. enforce strict state/action contracts
  3. add infra-backed integration lane
  4. improve typed error taxonomy + observability
  5. harden RAG reliability/quality
  6. reconcile docs with runtime behavior

---

## 2. Epics / Workstreams

1. **E1 — Runtime Startup & Import Safety**
2. **E2 — State Contract Enforcement (Orchestration + Agent Payloads)**
3. **E3 — Infra-Backed Integration Testing & Failure Injection**
4. **E4 — Error Taxonomy, Resilience, and Observability**
5. **E5 — RAG Reliability Hardening**
6. **E6 — Agent Safety & Reliability Hardening**
7. **E7 — API Resilience Under Infra Failure**
8. **E8 — Documentation & DX Alignment**
9. **E9 — Release Governance Gates**

---

## 3. Detailed Task Backlog

### Critical Blockers (must address immediately)

Task ID: E1-T01
Title: Remove import-time tokenizer network dependency in RAG chunking
Epic: E1 — Runtime Startup & Import Safety
Owner Type: AI-RAG
Severity: Critical
Priority: P0
Source Audit Finding: 1, 4, 6, 10, 15
Problem: `tiktoken.get_encoding("cl100k_base")` is initialized at import-time and may trigger remote download, breaking startup/tests in restricted environments.
Goal: Ensure app import/startup and pytest collection are network-independent for tokenizer initialization.
Scope:
- Refactor tokenizer initialization in `src/rag/chunking.py` to lazy-load on first use.
- Add deterministic local fallback behavior if encoder cannot be loaded.
- Ensure failures are explicit and non-blocking for module import.
Out of Scope:
- Reworking all chunking strategies.
Dependencies: None
Implementation Notes:
- Use function-level cached initializer (`@lru_cache`) with guarded exception handling.
- Add explicit error metric/log line for fallback path.
Acceptance Criteria:
- `python -c "import src.api.main"` succeeds without outbound network.
- Pytest test collection no longer fails because of tokenizer initialization.
- Chunking functions still produce expected outputs for existing unit tests.
Deliverables:
- Updated `src/rag/chunking.py`
- New/updated unit tests validating lazy init + fallback
Release Impact: Blocks Local Run

Task ID: E2-T01
Title: Define strict typed state contract for LangGraph state including active agents
Epic: E2 — State Contract Enforcement (Orchestration + Agent Payloads)
Owner Type: Backend
Severity: High
Priority: P0
Source Audit Finding: 4, 9, 15
Problem: Orchestration state schema drift exists (e.g., active agents not fully represented in state literals/types), increasing runtime mismatch risk.
Goal: Make state keys and allowed values explicit, versioned, and aligned with actual orchestrator nodes.
Scope:
- Update `src/models/agent_state.py` to include full active agent set.
- Add state schema validation helper used at orchestrator boundaries.
- Add regression tests for state compatibility.
Out of Scope:
- Redesigning LangGraph topology.
Dependencies: E1-T01 (to stabilize imports for tests)
Implementation Notes:
- Prefer Pydantic model wrapper for boundary validation + TypedDict for internal speed if needed.
- Include schema version field (`state_contract_version`).
Acceptance Criteria:
- State validation passes for all active graph routes.
- Invalid state mutations fail fast with typed errors.
- Tests cover router → specialist → final paths with contract assertions.
Deliverables:
- Updated `src/models/agent_state.py`
- New `src/orchestration/state_contract.py` (or equivalent)
- Unit/integration tests
Release Impact: Blocks Pilot

Task ID: E2-T02
Title: Enforce typed action payload contracts across all agents
Epic: E2 — State Contract Enforcement (Orchestration + Agent Payloads)
Owner Type: Backend
Severity: High
Priority: P0
Source Audit Finding: 5, 9, 15
Problem: `actions_taken` payloads are loosely structured and rely on permissive conventions, causing brittle inter-agent handoff behavior.
Goal: Standardize action envelope and per-agent action schemas for deterministic orchestration.
Scope:
- Introduce Pydantic models for action envelope + agent-specific payloads.
- Validate before appending to `state["actions_taken"]`.
- Normalize handoff fields (`summary_for_next_agent`, `entities_to_pass`, `suggested_next_agent`).
Out of Scope:
- Prompt redesign.
Dependencies: E2-T01
Implementation Notes:
- Add compatibility adapter for existing payloads during migration.
Acceptance Criteria:
- Every agent emits schema-valid action payloads.
- Orchestrator continues/ends without key errors for malformed payloads (typed error path).
Deliverables:
- `src/models/agent_actions.py` (new)
- Agent updates (`src/agents/*.py`)
- Contract tests per agent
Release Impact: Blocks Pilot

Task ID: E3-T01
Title: Add infra-backed integration test lane for `/api/v1/message`
Epic: E3 — Infra-Backed Integration Testing & Failure Injection
Owner Type: QA
Severity: Critical
Priority: P0
Source Audit Finding: 10, 14, 15
Problem: Current tests are heavily mocked, inflating confidence; core E2E path with real infra is not proven.
Goal: Validate API→orchestrator→agent→DB/store behavior against real local containers.
Scope:
- Create integration suite using Docker services for Redis/Qdrant/Postgres/Neo4j.
- Add at least one real `/api/v1/message` happy path and one degraded infra path.
- Isolate from external LLM by deterministic local stubs at network boundary only.
Out of Scope:
- Full production-scale load testing.
Dependencies: E1-T01
Implementation Notes:
- Use docker compose profile for CI test lane.
- Keep fixture data deterministic.
Acceptance Criteria:
- CI lane runs and passes consistently.
- At least 2 tests: happy-path + dependency-failure behavior.
- Failing infra dependency produces expected API behavior/logging.
Deliverables:
- `tests/integration_real/` test suite
- CI workflow update
- Test data fixtures/scripts
Release Impact: Blocks Pilot

Task ID: E4-T01
Title: Replace broad exception swallowing with typed error taxonomy in orchestration and agents
Epic: E4 — Error Taxonomy, Resilience, and Observability
Owner Type: Backend
Severity: High
Priority: P1
Source Audit Finding: 4, 5, 7, 9, 12, 15
Problem: Broad `except Exception` patterns suppress root causes and produce inconsistent behavior.
Goal: Introduce explicit error classes and deterministic handling paths.
Scope:
- Define `errors.py` taxonomy: transient external error, permanent validation error, dependency unavailable, contract violation.
- Replace broad catches in orchestrator + top-risk agents first (Pricing/Vetting/Outreach/Analytics).
- Ensure structured error responses/actions.
Out of Scope:
- Complete elimination of all generic catches in one sprint.
Dependencies: E2-T01, E2-T02
Implementation Notes:
- Preserve user-safe Hebrew/English messaging; log detailed internal cause.
Acceptance Criteria:
- Typed errors are emitted and logged with stable codes.
- No silent suppression in identified high-risk paths.
- Regression tests cover typed error routing to final response.
Deliverables:
- `src/errors.py` (new)
- Updated orchestration and agents
- Tests for error mapping
Release Impact: Blocks Pilot

Task ID: E7-T01
Title: Standardize API failure behavior under dependency outages
Epic: E7 — API Resilience Under Infra Failure
Owner Type: Backend
Severity: High
Priority: P1
Source Audit Finding: 8, 12
Problem: API reliability concerns are around infra failure consistency, not missing endpoints.
Goal: Provide consistent HTTP status codes and response contracts for downstream outages.
Scope:
- Define and implement error mapping for Redis/Qdrant/Postgres/Neo4j unavailability.
- Add contract tests for `/api/v1/message` and `/api/v1/health` degraded scenarios.
Out of Scope:
- Major API redesign.
Dependencies: E4-T01, E3-T01
Implementation Notes:
- Add dependency-specific status tags in response metadata where safe.
Acceptance Criteria:
- Dependency outages return deterministic status + payload.
- Health endpoint accurately reports degraded services.
Deliverables:
- API error mapping updates
- Integration tests for failure behavior
Release Impact: Blocks Pilot

---

### Pilot Readiness Tasks

Task ID: E6-T01
Title: Harden Pricing/Vetting/Outreach/Analytics agent safety checks
Epic: E6 — Agent Safety & Reliability Hardening
Owner Type: AI-RAG
Severity: High
Priority: P1
Source Audit Finding: 5
Problem: Higher-risk agents rely heavily on permissive LLM behavior and broad exception handling.
Goal: Add deterministic guardrails before agent outputs are accepted by orchestrator.
Scope:
- Add output schema validation + safe defaults for high-risk agents.
- Add “reject invalid output” path with fallback user-safe response.
- Add explicit follow-up/handoff constraints.
Out of Scope:
- Full prompt rewrite for all agents.
Dependencies: E2-T02, E4-T01
Implementation Notes:
- Start with Pricing and Vetting due operational impact.
Acceptance Criteria:
- Invalid LLM outputs do not propagate malformed action payloads.
- Agents return schema-valid safe fallback on invalid responses.
Deliverables:
- Updated agent modules
- Unit tests for malformed LLM output handling
Release Impact: Blocks Pilot

Task ID: E5-T01
Title: Implement RAG result normalization and minimum quality safeguards
Epic: E5 — RAG Reliability Hardening
Owner Type: AI-RAG
Severity: High
Priority: P1
Source Audit Finding: 3, 6, 15
Problem: RAG quality/reliability safeguards are weak for production-like usage.
Goal: Add deterministic post-retrieval quality controls before context enters prompts.
Scope:
- Add deduplication, score normalization, min-score filtering.
- Add max-source diversity rule for context block.
- Add retrieval telemetry fields (hit_count, filtered_count, avg_score).
Out of Scope:
- New vector DB vendor or full retrieval architecture replacement.
Dependencies: E1-T01
Implementation Notes:
- Keep configurable via settings with safe defaults.
Acceptance Criteria:
- Retrieved context sent to agents passes normalization checks.
- Metrics/logs show normalization decisions.
Deliverables:
- `src/rag/pipeline.py` updates
- RAG tests for normalization path
Release Impact: Blocks Pilot

Task ID: E5-T02
Title: Replace fragile reranker parsing with strict structured response schema
Epic: E5 — RAG Reliability Hardening
Owner Type: AI-RAG
Severity: Medium
Priority: P1
Source Audit Finding: 6
Problem: Reranking parse logic is brittle and depends on loosely formatted LLM output.
Goal: Make reranker scoring deterministic and schema-validated.
Scope:
- Use strict JSON schema for rerank response.
- Add parse failure fallback policy with explicit reason codes.
Out of Scope:
- Replacing reranker with external cross-encoder model (Needs Verification).
Dependencies: E4-T01
Implementation Notes:
- Reuse structured output helper where possible.
Acceptance Criteria:
- Reranker handles malformed output without crashes.
- Unit tests cover valid/invalid/no-score responses.
Deliverables:
- `src/rag/reranking.py` updates
- Unit tests
Release Impact: Blocks Pilot

Task ID: E4-T02
Title: Add structured observability fields for orchestration and agent runs
Epic: E4 — Error Taxonomy, Resilience, and Observability
Owner Type: Platform
Severity: Medium
Priority: P1
Source Audit Finding: 12, 15
Problem: Observability is partial; telemetry does not provide strong operational traceability.
Goal: Emit consistent fields for request, conversation, agent, dependency, and error code.
Scope:
- Add structured log schema and middleware propagation for request/conversation IDs.
- Record per-agent duration, decision type, and failure category.
Out of Scope:
- Full centralized observability platform migration.
Dependencies: E4-T01
Implementation Notes:
- Keep fields stable and documented.
Acceptance Criteria:
- Logs include request_id and conversation_id through full `/message` path.
- Agent execution logs include `agent_name`, `result`, `duration_ms`, `error_code`.
Deliverables:
- Middleware/logging updates
- Log schema doc
- Tests for correlation propagation
Release Impact: Blocks Pilot

Task ID: E3-T02
Title: Add failure-injection integration tests for each primary dependency
Epic: E3 — Infra-Backed Integration Testing & Failure Injection
Owner Type: QA
Severity: High
Priority: P1
Source Audit Finding: 7, 8, 10
Problem: Limited hard-failure test coverage for Postgres/Redis/Qdrant/Neo4j outage cases.
Goal: Validate resilience and API behavior under controlled dependency failures.
Scope:
- Add scenario tests for each dependency unavailable.
- Assert API status, payload contract, and recovery behavior.
Out of Scope:
- Chaos engineering in production.
Dependencies: E3-T01, E7-T01
Implementation Notes:
- Use docker-compose service stop/restart hooks in CI test job.
Acceptance Criteria:
- All four dependency-failure scenarios are covered.
- Failures produce deterministic responses and logs.
Deliverables:
- Integration failure test suite
- CI job extensions
Release Impact: Blocks Pilot

Task ID: E9-T01
Title: Define controlled pilot release checklist as enforceable CI gate
Epic: E9 — Release Governance Gates
Owner Type: Platform
Severity: High
Priority: P1
Source Audit Finding: 14, 15
Problem: No enforceable gate currently ties remediation to release readiness.
Goal: Convert pilot-readiness criteria into automated checks and required approvals.
Scope:
- Add CI job requiring completion of pilot-required tasks/tests.
- Add release checklist artifact consumed in PR template.
Out of Scope:
- Production gate policy (separate task).
Dependencies: E1-T01, E2-T01, E2-T02, E3-T01, E4-T01, E5-T01, E7-T01
Implementation Notes:
- Implement as status checks + markdown checklist in repo.
Acceptance Criteria:
- Pilot branch cannot merge unless required checks pass.
- Checklist maps to task IDs in this backlog.
Deliverables:
- CI workflow gate
- `docs/release_gates/pilot_gate.md`
Release Impact: Blocks Pilot

---

### Production Hardening Tasks

Task ID: E6-T02
Title: Add deterministic fallback policy for LLM-dependent decision paths
Epic: E6 — Agent Safety & Reliability Hardening
Owner Type: AI-RAG
Severity: High
Priority: P2
Source Audit Finding: 5, 12
Problem: Some decision paths over-trust LLM behavior, creating unsafe variability.
Goal: Introduce explicit fallback decision matrix for low-confidence/invalid outputs.
Scope:
- Define fallback table per high-risk agent.
- Enforce confidence + schema + dependency checks before “actionable” decisions.
Out of Scope:
- Business policy redesign.
Dependencies: E6-T01, E4-T01
Implementation Notes:
- Include `Needs Verification` markers where policy ownership is unclear.
Acceptance Criteria:
- High-risk agent outputs are gated by deterministic fallback policy.
- Tests verify fallback triggers and outcomes.
Deliverables:
- Fallback policy module/config
- Agent tests
Release Impact: Blocks Prod

Task ID: E5-T03
Title: Add retrieval strategy evaluation harness (semantic vs contextual vs hybrid)
Epic: E5 — RAG Reliability Hardening
Owner Type: AI-RAG
Severity: Medium
Priority: P2
Source Audit Finding: 6
Problem: Contextual retrieval currently behaves mostly like semantic retrieval; quality delta unverified.
Goal: Quantify retrieval effectiveness and decide keep/change strategy based on evidence.
Scope:
- Build offline evaluation set from existing domain queries.
- Measure precision@k/coverage for current strategies.
- Publish recommendation and implement selected strategy tuning.
Out of Scope:
- Large-scale model training.
Dependencies: E5-T01
Implementation Notes:
- Mark unknown gold labels as `Needs Verification`.
Acceptance Criteria:
- Evaluation report produced with baseline metrics.
- Strategy tuning changes merged with measurable improvement target.
Deliverables:
- Eval harness scripts/tests
- Report in `docs/rag/strategy_eval.md`
Release Impact: Blocks Prod

Task ID: E4-T03
Title: Add dependency health SLO signals and alert thresholds
Epic: E4 — Error Taxonomy, Resilience, and Observability
Owner Type: Infra
Severity: Medium
Priority: P2
Source Audit Finding: 12
Problem: Monitoring exists but lacks clear production-oriented SLO thresholds for dependency behavior.
Goal: Establish actionable SLO-based alerts for service degradation.
Scope:
- Define SLOs for startup success, `/message` success rate, dependency timeout rate.
- Configure alerts and dashboards for pilot/prod envs.
Out of Scope:
- 24/7 on-call process design.
Dependencies: E4-T02
Implementation Notes:
- Reuse existing Prometheus metrics path.
Acceptance Criteria:
- SLO dashboard and alert rules active.
- Alert tests demonstrate trigger behavior.
Deliverables:
- Monitoring config updates
- SLO docs
Release Impact: Blocks Prod

Task ID: E7-T02
Title: Add API resilience regression suite for timeout/backoff behavior
Epic: E7 — API Resilience Under Infra Failure
Owner Type: QA
Severity: Medium
Priority: P2
Source Audit Finding: 8, 12
Problem: Resilience behavior under latency/timeout stress is not validated by regression tests.
Goal: Ensure timeout/backoff and error contracts remain stable across releases.
Scope:
- Add API tests simulating slow dependencies and partial outages.
- Validate timeout thresholds and fallback responses.
Out of Scope:
- Load/perf benchmarking at scale.
Dependencies: E7-T01, E3-T02
Implementation Notes:
- Use test doubles only at network edges; preserve real app path.
Acceptance Criteria:
- Timeouts produce deterministic responses and logs.
- Regression suite runs in CI nightly or pre-release.
Deliverables:
- Resilience regression test suite
- CI schedule update
Release Impact: Blocks Prod

Task ID: E9-T02
Title: Define production-hardening gate with required technical controls
Epic: E9 — Release Governance Gates
Owner Type: Platform
Severity: High
Priority: P2
Source Audit Finding: 12, 14, 15
Problem: No formal production-hardening gate exists.
Goal: Create enforceable “prod-hardening candidate” criteria tied to automated evidence.
Scope:
- Define required controls and mandatory test evidence.
- Implement CI branch protection checks and release sign-off template.
Out of Scope:
- Full compliance program.
Dependencies: E6-T02, E5-T03, E4-T03, E7-T02, E8-T01
Implementation Notes:
- Include explicit exception process for temporary waivers.
Acceptance Criteria:
- Production gate checklist is versioned and enforced in CI.
- Release candidate cannot pass without mandatory evidence links.
Deliverables:
- `docs/release_gates/production_gate.md`
- CI protection updates
Release Impact: Blocks Prod

---

### Documentation / DX Alignment

Task ID: E8-T01
Title: Reconcile README and API/RAG docs with actual runtime endpoints and collections
Epic: E8 — Documentation & DX Alignment
Owner Type: Docs
Severity: High
Priority: P1
Source Audit Finding: 2, 11, 13, 15
Problem: Material docs-to-code drift (endpoint names, collection names, readiness posture) creates onboarding and planning risk.
Goal: Align all key docs to current runtime truth and explicitly state maturity/readiness.
Scope:
- Update `README.md`, API reference docs, and RAG docs with real endpoint and collection names.
- Add “Readiness Status” section reflecting current gate stage.
Out of Scope:
- Product marketing copy overhaul.
Dependencies: E3-T01 (to validate runtime truth before publishing)
Implementation Notes:
- Add source-of-truth links to code paths in docs.
Acceptance Criteria:
- Documentation references match actual runtime paths and names.
- New engineer can follow docs to run system without hidden assumptions.
Deliverables:
- Updated docs files
- DX quickstart validation checklist
Release Impact: Blocks Pilot

Task ID: E8-T02
Title: Add deterministic local onboarding script and environment preflight checks
Epic: E8 — Documentation & DX Alignment
Owner Type: Infra
Severity: Medium
Priority: P2
Source Audit Finding: 11
Problem: Onboarding is brittle due to hidden env/network assumptions.
Goal: Provide preflight script that validates required env/dependencies before startup.
Scope:
- Add script that checks required services, env vars, and known startup blockers.
- Integrate script into local setup docs and CI sanity check.
Out of Scope:
- Full installer automation for all platforms.
Dependencies: E1-T01, E8-T01
Implementation Notes:
- Report actionable errors with remediation text.
Acceptance Criteria:
- Preflight script returns non-zero on missing prerequisites.
- Setup guide references script as first step.
Deliverables:
- `scripts/preflight_check.py` (or shell equivalent)
- `LOCAL_SETUP.md` update
Release Impact: Improvement Only

Task ID: E3-T03
Title: Reduce mock-overreach in existing integration tests and classify test tiers
Epic: E3 — Infra-Backed Integration Testing & Failure Injection
Owner Type: QA
Severity: Medium
Priority: P2
Source Audit Finding: 10
Problem: “Integration” tests often rely on heavy internal mocking, reducing signal quality.
Goal: Reclassify tests by tier and migrate critical paths to higher-fidelity tests.
Scope:
- Create test taxonomy (`unit`, `component`, `integration-mocked`, `integration-real`).
- Migrate highest-priority mocked integration tests for `/message` path to infra-backed tier.
Out of Scope:
- Rewriting all legacy tests in one pass.
Dependencies: E3-T01
Implementation Notes:
- Tag tests with markers and update CI matrix.
Acceptance Criteria:
- Critical `/message` tests run in `integration-real` tier.
- CI reports pass/fail by test tier.
Deliverables:
- Test marker updates
- CI matrix update
- Migration report
Release Impact: Improvement Only

---

### Needs Verification Spikes

Task ID: SPIKE-01
Title: Validate production-safe tokenizer strategy (vendor cache vs bundled assets)
Epic: E1 — Runtime Startup & Import Safety
Owner Type: Platform
Severity: Medium
Priority: P1
Source Audit Finding: 1, 6, 10
Problem: Fallback options exist, but long-term operational choice is not confirmed.
Goal: Decide standard tokenizer distribution strategy for restricted environments.
Scope:
- Evaluate options: bundled encoding artifact, pre-warmed cache image layer, or runtime fallback-only.
Out of Scope:
- Full implementation across all environments.
Dependencies: E1-T01
Implementation Notes:
- Mark decision record as `Needs Verification` until approved by Infra + AI-RAG.
Acceptance Criteria:
- ADR with selected strategy and rollout plan approved.
Deliverables:
- Architecture decision record (ADR)
Release Impact: Improvement Only

Task ID: SPIKE-02
Title: Determine policy owner for high-risk agent fallback decisions
Epic: E6 — Agent Safety & Reliability Hardening
Owner Type: Backend
Severity: Medium
Priority: P1
Source Audit Finding: 5, 12
Problem: Some fallback decisions require product/ops policy input not present in audit.
Goal: Define decision ownership and approved fallback matrix boundaries.
Scope:
- Identify policy owner and decision SLA.
- Draft fallback decision matrix requiring approval.
Out of Scope:
- Implementing all fallback logic.
Dependencies: None
Implementation Notes:
- Keep explicit `Needs Verification` status until owner signs off.
Acceptance Criteria:
- Policy owner assigned and matrix approved for implementation.
Deliverables:
- Approved fallback policy document
Release Impact: Blocks Pilot

---

## 4. Dependency Graph

- E1-T01 → E2-T01, E3-T01, E5-T01, E8-T02, SPIKE-01
- E2-T01 → E2-T02 → E6-T01
- E2-T02 + E4-T01 → E6-T01
- E3-T01 → E3-T02, E3-T03, E8-T01
- E4-T01 → E4-T02, E5-T02, E6-T01, E7-T01
- E7-T01 → E3-T02, E7-T02
- E5-T01 → E5-T03
- E4-T02 → E4-T03
- E6-T01 → E6-T02
- E6-T02 + E5-T03 + E4-T03 + E7-T02 + E8-T01 → E9-T02
- E1-T01 + E2-T01 + E2-T02 + E3-T01 + E4-T01 + E5-T01 + E7-T01 (+ SPIKE-02 resolved) → E9-T01

---

## 5. Pilot Readiness Gate

### Required Tasks
- E1-T01
- E2-T01
- E2-T02
- E3-T01
- E4-T01
- E5-T01
- E6-T01
- E7-T01
- E8-T01
- E9-T01
- SPIKE-02 (decision finalized)

### Optional Tasks
- E5-T02
- E4-T02
- E3-T02
- E8-T02

### Risks if Skipped
- Startup/test instability remains (import-time break risk).
- Agent/orchestration payload drift causes unpredictable runtime behavior.
- Infra outage behavior remains inconsistent and unverified.
- Docs continue to mislead implementation and release decisions.

---

## 6. Production Hardening Gate

### Required Tasks
- All Pilot Gate required tasks
- E6-T02
- E5-T03
- E4-T03
- E7-T02
- E9-T02

### Optional Tasks
- E3-T03
- SPIKE-01 (if temporary strategy accepted)
- E8-T02

### Risks if Skipped
- LLM-driven high-risk decisions remain insufficiently deterministic.
- RAG strategy quality remains unquantified for production confidence.
- Observability lacks SLO-grade operational readiness.
- Production release approvals remain subjective and non-enforceable.

---

## 7. Suggested Execution Order

### Phase 0 (Immediate Stabilization, Week 1)
1. E1-T01
2. E2-T01
3. E2-T02
4. SPIKE-02

### Phase 1 (Pilot Path Foundation, Week 2–3)
5. E3-T01
6. E4-T01
7. E7-T01
8. E5-T01
9. E6-T01
10. E8-T01
11. E9-T01

### Phase 2 (Pilot Confidence + Reliability, Week 4)
12. E5-T02
13. E4-T02
14. E3-T02
15. E8-T02

### Phase 3 (Production Hardening Track, Week 5+)
16. E6-T02
17. E5-T03
18. E4-T03
19. E7-T02
20. E3-T03
21. SPIKE-01
22. E9-T02

