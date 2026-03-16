# Groupio Agent System — Design & UX Spec

> Companion to: `design-system/MASTER.md`
> Backend reference: `src/agents/`, `src/orchestration/`, `src/api/routes/agents.py`, `src/api/routes/admin.py`

---

## 1. Agent Architecture Overview

Groupio runs **11 AI agents** orchestrated via **LangGraph** with a router-based architecture. All agents inherit from `BaseAgent` and are coordinated through a state graph.

### Agent Inventory

| Agent | Purpose | Temperature | Mode | User-Facing? | Admin-Facing? |
|-------|---------|------------|------|-------------|--------------|
| **RouterAgent** | Intent classification, routes to specialists | 0.3 | Always active | Invisible | Status only |
| **MatchingAgent** | Contractor–resident matching (RAG + graph) | 0.5 | recommend | Indirect (results shown) | Metrics + config |
| **PricingAgent** | Tiered pricing, market analysis, social proof | 0.3 | recommend | Indirect (pricing shown) | Metrics + config |
| **VettingAgent** | Contractor verification, trust scoring | 0.2 | recommend | Invisible | Full management |
| **SupportAgent** | Customer support, RAG, escalation | 0.7 | Always active | Direct (chat) | Escalation queue |
| **OutreachAgent** | Engagement campaigns (WhatsApp, email) | 0.7 | gated | Receives messages | Campaign approval |
| **AnalyticsAgent** | NL-to-SQL queries, trend analysis | 0.3 | recommend | Invisible | Reports + queries |
| **ArchitectureAgent** | Floor plan analysis (Vision AI) | 0.4 | recommend | Upload results | Status only |
| **InfluencerAgent** | Top connectors, credit awards | 0.3 | recommend | Credit notifications | Approval queue |
| **PaymentAgent** | Payment status, invoices, refunds | 0.5 | recommend | Indirect (status) | Escalation |
| **NotificationAgent** | Multi-channel delivery | 0.7 | N/A (not in graph) | Receives notifications | Config only |

### Orchestration Flow

```
User Message → RouterAgent → [Intent Classification]
                                │
                    ┌───────────┼───────────────────┐
                    ▼           ▼                   ▼
              MatchingAgent  PricingAgent      SupportAgent
              VettingAgent   OutreachAgent     AnalyticsAgent
              ArchitectureAgent  InfluencerAgent  PaymentAgent
                    │           │                   │
                    ▼           ▼                   ▼
              [needs_human?] → HumanHandoff → EscalationQueue
                    │
                    ▼
              FinalResponse → User
```

### Agent Modes (Autonomy Levels)

| Mode | Behavior | UI Implication |
|------|----------|----------------|
| `auto` | Agent acts independently | No admin approval needed |
| `recommend` | Agent recommends, admin approves | Shows in pending decisions queue |
| `gated` | Agent prepares, always requires approval | Always in pending decisions queue |

### Key Thresholds

| Setting | Value | Impact |
|---------|-------|--------|
| Router confidence | 0.7 | Below = fallback to support or clarification |
| Sentiment escalation | -0.5 | Below = auto-escalate to human |
| Max support attempts | 3 | After 3 attempts = escalate |
| Vetting auto-approve | 85+ trust score | Above = auto-approve contractor |
| Vetting auto-reject | <50 trust score | Below = auto-reject |
| Min insurance coverage | ₪500,000 | Required for verification |

---

## 2. Agent UX Surfaces

### 2.1 Resident-Facing Agent UX

Residents interact with agents primarily through the **AI Chat** (`/chat`) and indirectly through agent-generated content.

#### AI Chat (SupportAgent)

**Current state**: `AIChat` component with message list, streaming, suggestion chips.

**Current problems**:
- No indication of which agent is handling the request
- No transparency about AI vs human
- Suggestion chips are static, not context-aware
- No conversation history persistence across sessions (UI-side)
- No handoff UX — if escalated, resident doesn't know what happened

**Redesign spec**:

```
┌──────────────────────────────────────┐
│  💬 העוזר החכם של גרופיו            │
│  ─────────────────────────────────── │
│                                      │
│  [Bot] שלום! אני העוזר החכם של     │
│  גרופיו. איך אפשר לעזור?          │
│                                      │
│  [User] מה מצב ההזמנה שלי?          │
│                                      │
│  [Bot] ⏳ בודק את ההזמנה שלך...     │
│  [Bot] ההזמנה #1234 למצב:           │
│  ✅ תשלום התקבל                      │
│  ⏳ ממתין לתיאום עם הקבלן           │
│                                      │
│  ─────────────────────────────────── │
│  💡 Suggestions:                     │
│  [מצב הזמנה] [הצעות חדשות]          │
│  [שאלה על תשלום] [דברו עם נציג]    │
│                                      │
│  ┌──────────────────────────── ➤ │  │
│  │ הקלידו הודעה...              │  │
│  └──────────────────────────────── │
└──────────────────────────────────────┘
```

**Key UX rules**:
- Always show "AI assistant" indicator — never pretend to be human
- When escalating to human: show clear message "מעביר לנציג אנושי — נחזור אליכם בהקדם"
- Thinking/processing state: animated dots with context ("בודק את ההזמנה...")
- Error state: "משהו השתבש — נסו שוב או פנו לתמיכה"
- Context-aware suggestions based on user's active offers/orders
- Conversation history: persist and show previous conversations
- "דברו עם נציג" always available as suggestion

#### Agent-Generated Content (Invisible Agents)

| Agent | Where Results Appear | UX Element |
|-------|---------------------|------------|
| MatchingAgent | Offer detail → contractor selection | "קבלן מומלץ" badge with match score |
| PricingAgent | Offer creation → pricing suggestions; Offer detail → tier rationale | "מחיר מומלץ" tooltip; "למה המחיר הזה?" expandable |
| VettingAgent | Contractor badges, trust scores | Trust score breakdown in contractor profiles |
| NotificationAgent | Push, email, WhatsApp | Standard notification patterns |

### 2.2 Contractor-Facing Agent UX

#### AI Chat on Contractor Dashboard

**Current state**: AIChat component in contractor dashboard sidebar.

**Redesign spec**:
- Minimized by default: floating button or collapsed bar
- Context: contractor-specific suggestions ("איך לשפר ציון אמון?", "הצעות מומלצות ליצירה")
- Can help with offer creation, pricing optimization, document questions
- Show vetting status context ("המסמכים שלכם נמצאים בבדיקה")

#### Vetting UX for Contractors

**Where it appears**: Contractor profile, document upload, attention banner on dashboard

**Flow**:
1. Contractor uploads documents → **VettingAgent** processes
2. Status updates: "המסמכים נשלחו לבדיקה" → "בודקים את הרישיון שלכם" → "אומתו!" or "נדרשים מסמכים נוספים"
3. If `recommend` mode: admin sees in pending queue, contractor sees "ממתין לאישור"
4. If auto-approved (trust > 85): immediate "אושרתם! ✓" notification

**UX elements**:
- Document status cards: icon + status badge (submitted / reviewing / approved / rejected)
- Trust score progress: "ציון האמון שלכם: 72/100 — שפרו ע״י העלאת תעודת ביטוח"
- Missing document alert: specific guidance on what's needed

### 2.3 Admin-Facing Agent UX

The admin agent management page (`/agents`) is the most agent-heavy UI. It needs significant attention.

#### Admin Agent Dashboard

**Current state**: Agent cards, config toggles, performance chart, orchestration graph, pending decisions, activity log.

**Current problems**:
1. Agent cards show raw metrics but no actionable context
2. Orchestration graph is a static SVG — not interactive
3. Pending decisions queue is basic — no filtering or priority
4. No alert when an agent is degraded or high error rate
5. Agent modes (auto/recommend/gated) not visible in card
6. No way to view an agent's recent conversations/decisions
7. Trust scores are simulated in contractor vetting

**Redesign spec**:

##### Agent Overview Grid

```
┌────────────────────────────────────────┐
│  System Health: ● Healthy              │
│  Active Agents: 10/11  │ Pending: 5    │
├────────────────────────────────────────┤
│                                        │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ Router   │ │ Support  │ │ Match  │ │
│  │ ● Active │ │ ● Active │ │ ● Act  │ │
│  │ 45ms avg │ │ 1.2s avg │ │ 890ms  │ │
│  │ 0.1% err │ │ 2.1% err │ │ 0.5%   │ │
│  │ auto     │ │ auto     │ │ rec.   │ │
│  └──────────┘ └──────────┘ └────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ Pricing  │ │ Vetting  │ │ Outreach│ │
│  │ ● Active │ │ ● Active │ │ ● Act  │ │
│  │ 650ms    │ │ 2.3s avg │ │ 450ms  │ │
│  │ 0.3% err │ │ 0.8% err │ │ 0.1%   │ │
│  │ rec.     │ │ rec.     │ │ gated  │ │
│  └──────────┘ └──────────┘ └────────┘ │
│  ... (analytics, architecture,         │
│       influencer, payment, notification)│
└────────────────────────────────────────┘
```

**Each agent card shows**:
- Name + description tooltip
- Status dot: healthy (green), degraded (yellow), unhealthy (red), offline (gray)
- Avg response time (ms)
- Error rate (%)
- Current mode badge: auto | recommend | gated
- Requests per minute sparkline
- Quick actions: reload, configure, view logs

##### Agent Configuration Panel

When clicking "configure" on an agent card:

| Field | Type | Description |
|-------|------|-------------|
| Mode | Select (auto/recommend/gated) | Autonomy level |
| Temperature | Slider 0.0–1.0 | LLM creativity |
| Enabled | Toggle | Enable/disable agent |
| Custom prompt override | Textarea | Override system prompt |
| Confidence threshold | Slider 0.0–1.0 | Routing threshold |

##### Pending Decisions Queue

```
┌──────────────────────────────────────────────────┐
│  החלטות ממתינות (5)                               │
│  ─────────────────────────────────────────────── │
│  Filter: [All Agents ▼] [All Types ▼] [Search]  │
│                                                   │
│  ┌─ Vetting ──────────────────────────────────┐  │
│  │ אישור קבלן: שיפוצי הצפון בע"מ              │  │
│  │ Trust Score: 78 │ License: ✓ │ Insurance: ✓ │  │
│  │ Agent recommends: Approve                    │  │
│  │ Reasoning: "All documents verified..."       │  │
│  │ [Approve ✓] [Reject ✗] [Request More Info]  │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│  ┌─ Outreach ─────────────────────────────────┐  │
│  │ Campaign: Welcome message to 12 new users   │  │
│  │ Channel: WhatsApp │ Variant: A              │  │
│  │ Preview: "!ברוכים הבאים לגרופיו..."          │  │
│  │ [Approve & Send] [Edit] [Reject]            │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

**Decision types and their UX**:
| Type | Agent | What Admin Sees | Actions |
|------|-------|-----------------|---------|
| Contractor approval | Vetting | Trust score, documents, reasoning | Approve / Reject / Request docs |
| Outreach campaign | Outreach | Message preview, audience, channel | Approve & Send / Edit / Reject |
| Credit award | Influencer | Resident, amount, reason | Approve / Adjust / Reject |
| Payment refund | Payment | Amount, reason, invoice ref | Approve / Deny / Escalate |
| Offer matching | Matching | Contractor match, score, reasoning | Confirm / Override / Skip |

##### Agent Activity Log

| Column | Description |
|--------|-------------|
| Timestamp | When the action occurred |
| Agent | Which agent acted |
| Action | What it did (classify, recommend, approve, escalate) |
| User | Which user triggered it |
| Confidence | Confidence score |
| Tokens | LLM tokens used |
| Latency | Response time |
| Status | Success / Error / Escalated |

Filterable by: agent, action type, date range, confidence range.

##### Orchestration Graph (Interactive)

**Current**: Static SVG.

**Redesign**:
- Interactive node-graph visualization
- Nodes are clickable → show agent details
- Edges show message flow with counts
- Real-time: animate active flows
- Color-coded: healthy (green), processing (blue pulse), error (red)
- Hover on node: show metrics popup

---

## 3. Agent-Data UX Mapping

How each agent uses database data and where results appear in UI:

| Agent | Reads From | Writes To | UI Surface |
|-------|-----------|----------|------------|
| **Router** | `chat_messages`, `users`, `conversation_logs` | `agent_audit_log` | Invisible (routing) |
| **Matching** | `contractors`, `offers`, `buildings`, `contractor_reviews` | `agent_audit_log`, `pending_agent_decisions` | Offer detail (matched contractor), contractor directory |
| **Pricing** | `offers`, `offer_participants`, `contractors`, market data | `offers.pricing_tiers`, `offers.pricing_rationale`, `agent_audit_log` | Offer creation (suggestions), offer detail (tier rationale) |
| **Vetting** | `contractors`, `file_uploads`, `contractor_verification_metadata` | `contractors.trust_score`, `contractors.verification_status`, `contractor_verification_metadata`, `agent_audit_log`, `pending_agent_decisions` | Contractor profile (trust score), admin vetting queue |
| **Support** | `offers`, `payments`, `escalations`, `buildings`, `chat_messages` | `chat_messages`, `escalations`, `agent_audit_log` | AI Chat (direct), escalation creation |
| **Outreach** | `users`, `buildings`, `offers`, `offer_participants` | `outreach_queue`, `agent_audit_log`, `pending_agent_decisions` | Push/email/WhatsApp (received by user) |
| **Analytics** | All tables (NL-to-SQL) | `agent_audit_log` | Admin analytics page |
| **Architecture** | `file_uploads`, `buildings` | `file_uploads.analysis_result`, `agent_audit_log` | Architecture page (upload results) |
| **Influencer** | `users`, `offer_participants`, `invitations`, graph data | `credit_awards`, `agent_audit_log`, `pending_agent_decisions` | Credit notification, admin approval |
| **Payment** | `payments`, `invoices`, `payment_splits`, `offers` | `agent_audit_log`, `pending_agent_decisions` | Payment status in chat, admin queue |
| **Notification** | `users.push_token`, notification settings | External (email, push, WhatsApp) | Device notifications |

---

## 4. Agent-Specific UI Components

### New Components Needed

| Component | Purpose | Used In |
|-----------|---------|---------|
| `AgentStatusDot` | Colored dot (green/yellow/red/gray) for agent health | Agent cards, dashboard |
| `AgentModeLabel` | Badge showing auto/recommend/gated | Agent cards, config |
| `PendingDecisionCard` | Decision card with agent reasoning + actions | Admin agents page |
| `AgentConfigPanel` | Slide-out panel for agent configuration | Admin agents page |
| `OrchestrationGraph` | Interactive node-graph with live data | Admin agents page |
| `AgentActivityLog` | Filterable table of agent actions | Admin agents page |
| `AgentReasoningBlock` | Expandable block showing agent's reasoning chain | Pending decisions, audit log |
| `ChatEscalationBanner` | Banner in chat when escalated to human | AI Chat |
| `TrustScoreBreakdown` | Visual breakdown of vetting agent's trust calculation | Contractor profile, admin vetting |
| `VettingStatusTimeline` | Timeline of contractor verification steps | Contractor profile |
| `CampaignPreviewCard` | Preview of outreach message before approval | Admin outreach queue |
| `MatchScoreCard` | Show matching agent's recommendation with score | Offer matching (admin) |

### Existing Components to Enhance

| Component | Enhancement |
|-----------|-------------|
| `AgentCard` | Add mode badge, click-through to config, better status indicators |
| `AgentMetricsChart` | Add comparison mode, date range selector |
| `AIChat` | Add escalation UX, context-aware suggestions, conversation history |
| `ContractorTrustBadge` | Show vetting agent source data, expandable breakdown |

---

## 5. Agent Trust Communication

How to communicate AI involvement to users **transparently** without causing anxiety:

### Resident-Facing

| Context | What to Show | What NOT to Show |
|---------|-------------|-----------------|
| AI Chat | "העוזר החכם של גרופיו" label | Don't say "AI agent" or "LLM" |
| Matched contractor | "מומלץ עבורכם" badge | Don't show matching algorithm details |
| Pricing suggestion | "מחיר משתלם לקבוצה" | Don't show "AI-calculated price" |
| Escalation | "מעביר לנציג אנושי" | Don't show internal routing details |
| Notification | Standard notification UI | Don't label as "AI-generated message" |

### Contractor-Facing

| Context | What to Show | What NOT to Show |
|---------|-------------|-----------------|
| Vetting | "המסמכים בבדיקה" with progress | Don't show trust score algorithm |
| Trust score | Score + improvement tips | Don't show individual weight factors |
| Match notification | "קיבלתם הצעה חדשה!" | Don't show match score number |

### Admin-Facing

| Context | What to Show | Full Transparency |
|---------|-------------|-------------------|
| Agent metrics | Response time, error rate, throughput | Yes — full metrics |
| Pending decisions | Agent reasoning, confidence, alternatives | Yes — full chain |
| Audit log | All agent actions with context | Yes — complete log |
| Configuration | All thresholds, modes, prompts | Yes — full control |

---

## 6. Agent Monitoring Alerts

### Admin Dashboard Alert Rules

| Alert | Condition | Severity | UI Placement |
|-------|-----------|----------|-------------|
| Agent offline | Status = offline > 1 min | Critical (red) | Dashboard attention bar + agents page |
| High error rate | Error rate > 5% over 5 min | Warning (yellow) | Dashboard attention bar |
| High latency | Avg response > 5s over 5 min | Warning (yellow) | Agent card indicator |
| Escalation spike | 3x normal escalation rate | Info (blue) | Dashboard metrics |
| Pending queue full | > 20 pending decisions | Warning (yellow) | Sidebar badge + dashboard |
| Low confidence streak | 5+ consecutive low-confidence routes | Info (blue) | Agent activity log |

---

## 7. Implementation Notes

### Files Involved

| Category | Files |
|----------|-------|
| Agent definitions | `src/agents/{base,router,matching,pricing,vetting,support,outreach,analytics,architecture,influencer,payment,notification}.py` |
| Orchestration | `src/orchestration/graph.py`, `state.py`, `state_contract.py` |
| Agent state model | `src/models/agent_state.py`, `src/models/agent_actions.py` |
| Agent API | `src/api/routes/agents.py`, `src/api/routes/admin.py` |
| Agent config | `src/config/settings.py`, `src/config/prompts/*.py` |
| Agent worker | `src/workers/agent_worker.py` |
| Admin UI | `apps/admin/app/agents/page.tsx`, `apps/admin/components/features/agents/` |
| Chat UI | `apps/web/components/features/chat/AIChat.tsx` |
| Contractor profile | `apps/web/app/contractor/profile/page.tsx` |

### API Endpoints for Admin Agent Management

| Endpoint | Method | Use |
|----------|--------|-----|
| `/api/v1/admin/status` | GET | System status with per-agent health |
| `/api/v1/admin/agents/{name}/reload` | POST | Hot-reload agent config |
| `/api/v1/admin/metrics` | GET | All agent metrics |
| `/api/v1/admin/agents/audit` | GET | Agent audit log |
| `/api/v1/admin/agents/autonomy` | GET | Current autonomy mode per agent |
| `/api/v1/admin/agents/pending-decisions` | GET | Pending decision queue |
| `/api/v1/admin/agents/pending-decisions/{id}/approve` | POST | Approve decision |
| `/api/v1/admin/agents/pending-decisions/{id}/reject` | POST | Reject decision |
| `/api/v1/agents/` | GET | List all agents |
| `/api/v1/agents/{name}/metrics` | GET | Single agent metrics |
