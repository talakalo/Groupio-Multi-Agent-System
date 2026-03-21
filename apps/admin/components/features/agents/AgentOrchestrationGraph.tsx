"use client";

import { useState } from "react";
import { clsx } from "clsx";

// ---------------------------------------------------------------------------
// Agent orchestration graph — interactive SVG visualization
// ---------------------------------------------------------------------------

interface NodeDef {
  id: string;
  label: string;
  x: number;
  y: number;
  type: "router" | "agent" | "sink";
  color: string;
  textColor: string;
}

interface EdgeDef {
  from: string;
  to: string;
}

const NODES: NodeDef[] = [
  { id: "router", label: "Router", x: 80, y: 180, type: "router", color: "#EDE9FE", textColor: "#6D28D9" },
  { id: "matching", label: "Matching", x: 260, y: 40, type: "agent", color: "#EFF6FF", textColor: "#1D4ED8" },
  { id: "pricing", label: "Pricing", x: 260, y: 100, type: "agent", color: "#EFF6FF", textColor: "#1D4ED8" },
  { id: "vetting", label: "Vetting", x: 260, y: 160, type: "agent", color: "#EFF6FF", textColor: "#1D4ED8" },
  { id: "support", label: "Support", x: 260, y: 220, type: "agent", color: "#EFF6FF", textColor: "#1D4ED8" },
  { id: "outreach", label: "Outreach", x: 260, y: 280, type: "agent", color: "#EFF6FF", textColor: "#1D4ED8" },
  { id: "architecture", label: "Architect.", x: 260, y: 340, type: "agent", color: "#EFF6FF", textColor: "#1D4ED8" },
  { id: "payment", label: "Payment", x: 260, y: 400, type: "agent", color: "#EFF6FF", textColor: "#1D4ED8" },
  { id: "notification", label: "Notify", x: 260, y: 460, type: "agent", color: "#EFF6FF", textColor: "#1D4ED8" },
  { id: "analytics", label: "Analytics", x: 440, y: 140, type: "sink", color: "#F0FDF4", textColor: "#166534" },
  { id: "human", label: "Human\nReview", x: 440, y: 300, type: "sink", color: "#FFFBEB", textColor: "#92400E" },
];

const AGENTS = NODES.filter((n) => n.type === "agent").map((n) => n.id);

const EDGES: EdgeDef[] = [
  ...AGENTS.map((id) => ({ from: "router", to: id })),
  ...AGENTS.map((id) => ({ from: id, to: "analytics" })),
  { from: "matching", to: "human" },
  { from: "pricing", to: "human" },
  { from: "vetting", to: "human" },
  { from: "payment", to: "human" },
];

function getNode(id: string): NodeDef | undefined {
  return NODES.find((n) => n.id === id);
}

function isEdgeActive(edge: EdgeDef, selectedAgent: string | null): boolean {
  if (!selectedAgent) return true;
  return edge.from === selectedAgent || edge.to === selectedAgent || edge.from === "router";
}

interface Props {
  selectedAgent: string | null;
}

export function AgentOrchestrationGraph({ selectedAgent }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const active = hovered || selectedAgent;

  const WIDTH = 560;
  const HEIGHT = 520;
  const NODE_W = 80;
  const NODE_H = 28;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        style={{ maxWidth: WIDTH, display: "block", margin: "0 auto" }}
        aria-label="Agent orchestration pipeline graph"
        role="img"
      >
        {/* Edges */}
        {EDGES.map((edge) => {
          const from = getNode(edge.from);
          const to = getNode(edge.to);
          if (!from || !to) return null;
          const isActive = isEdgeActive(edge, active);
          const x1 = from.x + NODE_W;
          const y1 = from.y + NODE_H / 2;
          const x2 = to.x;
          const y2 = to.y + NODE_H / 2;
          const mx = (x1 + x2) / 2;
          return (
            <path
              key={`${edge.from}-${edge.to}`}
              d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
              fill="none"
              stroke={isActive ? "#818CF8" : "#E5E7EB"}
              strokeWidth={isActive ? 1.5 : 1}
              strokeOpacity={isActive ? 0.8 : 0.4}
              markerEnd="url(#arrow)"
            />
          );
        })}

        {/* Arrow marker */}
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#818CF8" />
          </marker>
        </defs>

        {/* Nodes */}
        {NODES.map((node) => {
          const isHighlighted = !active || active === node.id || node.type !== "agent";
          const lines = node.label.split("\n");
          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              onMouseEnter={() => setHovered(node.id)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "pointer" }}
              role="listitem"
              aria-label={`${node.label} node`}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={6}
                fill={node.color}
                stroke={isHighlighted ? node.textColor : "#D1D5DB"}
                strokeWidth={isHighlighted ? 1.5 : 0.5}
                strokeOpacity={isHighlighted ? 0.8 : 0.3}
                fillOpacity={isHighlighted ? 1 : 0.5}
              />
              {lines.map((line, i) => (
                <text
                  key={i}
                  x={NODE_W / 2}
                  y={NODE_H / 2 - (lines.length - 1) * 5 + i * 11}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="9"
                  fontWeight={node.type === "router" ? "700" : "500"}
                  fill={node.textColor}
                  fillOpacity={isHighlighted ? 1 : 0.4}
                >
                  {line}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
      <p className="text-xs text-surface-400 mt-3 text-center">
        {AGENTS.length + 2} nodes in orchestration pipeline — click an agent card to highlight its connections
      </p>
    </div>
  );
}
