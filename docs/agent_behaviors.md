# Agent Behaviors

## Overview

The system contains 7 specialized agents coordinated by a LangGraph orchestrator.

## 1. Router Agent

**Purpose**: Classify user intent and route to the correct specialist agent.

**Behavior**:
- Analyzes message content, user profile, and conversation history
- Outputs structured JSON with intent, entities, confidence score
- If confidence < 0.7, asks a clarifying question in Hebrew
- Supported intents: `contractor_search`, `pricing_question`, `order_status`, `complaint`, `contractor_verification`, `analytics_query`, `general_info`, `technical_support`

**Example**:
```
User: "מחפש קבלן מזגנים לבניין שלי"
Router: intent=contractor_search, confidence=0.95, agent=matching
```

## 2. Matching Agent

**Purpose**: Find and rank contractors for resident requests.

**Behavior**:
1. Semantic search on contractor profiles (Qdrant)
2. Graph query for proven track record (Neo4j)
3. Weighted scoring: semantic (25%), graph (25%), rating (20%), price (15%), availability (10%), response time (5%)
4. LLM generates natural language recommendation

**Tools**: vector_search, graph_query, calculate_match_score

## 3. Pricing Agent

**Purpose**: Dynamic tiered pricing with market intelligence.

**Behavior**:
1. Retrieves pricing guides from knowledge base
2. Queries market data from PostgreSQL
3. Calculates tier discounts: 3-5 units (5%), 6-10 (10%), 11-20 (15%), 21+ (20%)
4. Applies seasonal adjustments (AC in summer +15%, heating in winter +20%)
5. Flags if price is too low (quality risk) or too high (above market)

**Tools**: vector_search, sql_query, calculate_tiers

## 4. Vetting Agent

**Purpose**: Verify contractor credentials and assess trustworthiness.

**Behavior**:
1. Document extraction (license, insurance, certificates)
2. Credential validation via external APIs
3. Online reputation analysis (web search + sentiment)
4. Trust score calculation (0-100): license (25), insurance (20), experience (15), reputation (15), completion rate (15), response rate (10)
5. Decision: auto-approve (85+), manual review (50-85), auto-reject (<50)

**Tools**: document_classifier, check_license_api, web_search, sentiment_analyzer

## 5. Support Agent

**Purpose**: Conversational customer support with RAG-powered responses.

**Behavior**:
- Intent-based RAG strategy: different sources per support topic
- Conversation memory via Redis (10-message window, 24h TTL)
- Escalation rules: negative sentiment, legal keywords, high-value complaints, 3+ resolution attempts
- Responds in Hebrew by default

**Tools**: vector_search, sql_query, get_order_status, escalate_to_human

## 6. Outreach Agent

**Purpose**: Proactive engagement campaigns.

**Campaign Types**:
- New building onboarding (welcome sequence)
- Offer momentum (near tier threshold notifications)
- Contractor reactivation (30-day inactive)
- Seasonal campaigns (AC in summer, heating in winter)

**Features**: A/B testing, personalization engine, multi-channel (WhatsApp, email, push)

## 7. Analytics Agent

**Purpose**: Business intelligence and natural language querying.

**Behavior**:
- Natural language to SQL conversion
- Trend analysis on conversation data
- Supports Hebrew and English queries
- SQL validation to prevent injection

**Tools**: nl_to_sql, execute_query, vector_search

## Human Handoff

Any agent can trigger escalation via `needs_human=True` in state. Triggers:
- Sentiment score < -0.5
- Legal keyword detection
- High-value complaint
- 3+ failed resolution attempts

Creates a support ticket with full context for the human agent.

## Inter-agent communication

Agents do not call each other directly. They share a single **state** object and use a **structured handoff** when the workflow returns to the router after a specialist (e.g. when the user asks a follow-up like "what about price?" after seeing contractor matches).

- **State:** All agents read and write `state` (e.g. `entities`, `context_for_next_agent`, `actions_taken`). The router writes extracted entities to `state["entities"]`; specialists can set `state["context_for_next_agent"]` for the next agent.
- **Handoff:** When a specialist finishes, it appends an action to `actions_taken` with optional `summary_for_next_agent`, `suggested_next_intent`, and `entities_to_pass`. If `requires_followup` is true, the graph goes back to the router; the orchestrator copies the last action into `state["last_agent_handoff"]` so the router can route the follow-up correctly.
- **Flow:** On "continue", the next node is the router. The orchestrator sets `last_agent_handoff` from the last `actions_taken` entry before running the router. The router sees this context and (optionally the user's follow-up message) and routes to the appropriate next agent (e.g. matching → pricing for "what about price?").

See [Agent handoff contract](agent_handoff_contract.md) for the full action shape and state fields.
