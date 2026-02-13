# Agent Handoff Contract

Agents do not call each other directly. They communicate via **shared state** and a **structured handoff** when the workflow returns to the router after a specialist (i.e. when `requires_followup` is true).

## State fields for handoff

| Field | Set by | Description |
|-------|--------|-------------|
| `entities` | Router, specialists | Single source for extracted entities: `building_id`, `offer_id`, `contractor_id`, `category`. All agents read/write here. |
| `last_agent_handoff` | Orchestrator | Populated from the last `actions_taken` entry when transitioning back to the router after a specialist. Contains normalized handoff data for follow-up routing. |
| `context_for_next_agent` | Specialists | Data produced for the next agent (e.g. `contractor_ids`, `category`, `offer_id`, `amount`). Next agent can reuse instead of re-fetching. |

## Action shape (actions_taken entry)

Every specialist must set the following when appending to `actions_taken`:

### Required

- `agent`: string (agent name)
- `action`: string (e.g. "contractor_matches", "pricing_analysis")
- `response`: dict with at least `type` and `message`
- `requires_followup`: bool

### Handoff (when the conversation may continue to another agent)

- `summary_for_next_agent`: string (1–2 sentences: what this agent did and found). Used by the router to route follow-ups.
- `suggested_next_intent`: string (optional), e.g. `"pricing_question"`, `"payment_query"`
- `entities_to_pass`: dict (optional), e.g. `{"contractor_ids": [...], "category": "ac_installation"}`
- `suggested_next_agent`: string (optional), e.g. `"pricing"`, `"payment"`

### Example

```python
{
    "agent": "matching",
    "action": "contractor_matches",
    "response": {"type": "contractor_matches", "message": "...", "matches": [...]},
    "requires_followup": True,
    "summary_for_next_agent": "Found 3 contractors for AC installation in Tel Aviv.",
    "suggested_next_intent": "pricing_question",
    "entities_to_pass": {"contractor_ids": ["c1", "c2"], "category": "ac_installation"},
    "suggested_next_agent": "pricing",
}
```

## Orchestrator behavior

When the graph transitions from a specialist to **continue** (i.e. `requires_followup` is true), the next node is the **router**. Before running the router, the orchestrator sets `state["last_agent_handoff"]` from the last entry in `state["actions_taken"]`, normalizing it to:

- `agent`
- `summary_for_next_agent`
- `suggested_next_intent`
- `entities_to_pass`
- `response_preview` (short summary of the response for context)

On the first turn (entry from the API), `last_agent_handoff` is not set (remains `None`).

## Inter-agent communication flow

1. User sends a message → router classifies intent → specialist runs (e.g. matching).
2. Specialist appends an action with handoff fields and sets `requires_followup=True` if the user might ask a follow-up (e.g. pricing).
3. Graph returns to router. Orchestrator sets `last_agent_handoff` from the last action.
4. Router receives state including `last_agent_handoff` and uses it (and optionally the user’s follow-up message) to route to the appropriate next agent (e.g. pricing).
5. The next agent can read `state["context_for_next_agent"]` and `state["entities"]` to reuse context instead of re-extracting.

Agents never invoke another agent directly; all coordination goes through the orchestrator and shared state.
