"use client";

import React, { useState } from "react";
import { cva, type VariantProps } from "class-variance-authority";

const sidebarVariants = cva(
  "flex flex-col h-full transition-all duration-300",
  {
    variants: {
      variant: {
        default: "bg-white border-r border-gray-200",
        dark: "bg-gray-900 text-white border-r border-gray-800",
        transparent: "bg-transparent",
      },
      position: {
        left: "left-0",
        right: "right-0",
      },
      collapsed: {
        true: "w-16",
        false: "w-64",
      },
    },
    defaultVariants: {
      variant: "default",
      position: "left",
      collapsed: false,
    },
  }
);

export interface SidebarItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  href?: string;
  badge?: string | number;
  active?: boolean;
  disabled?: boolean;
  children?: SidebarItem[];
  section?: string;
}

export interface SidebarSection {
  title?: string;
  items: SidebarItem[];
}

export interface SidebarProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof sidebarVariants> {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  sections?: SidebarSection[];
  items?: SidebarItem[];
  onItemClick?: (item: SidebarItem) => void;
  onCollapse?: (collapsed: boolean) => void;
  collapsible?: boolean;
  dir?: "ltr" | "rtl";
}

export const Sidebar = React.forwardRef<HTMLElement, SidebarProps>(
  (
    {
      className,
      variant,
      position,
      collapsed = false,
      header,
      footer,
      sections = [],
      items = [],
      onItemClick,
      onCollapse,
      collapsible = true,
      dir = "ltr",
      ...props
    },
    ref
  ) => {
    const [isCollapsed, setIsCollapsed] = useState(collapsed);

    const handleToggleCollapse = () => {
      const newCollapsed = !isCollapsed;
      setIsCollapsed(newCollapsed);
      onCollapse?.(newCollapsed);
    };

    // Combine items into sections if no sections provided
    const allSections: SidebarSection[] =
      sections.length > 0
        ? sections
        : items.length > 0
        ? [{ items }]
        : [];

    return (
      <aside
        ref={ref}
        className={sidebarVariants({
          variant,
          position,
          collapsed: isCollapsed,
          className,
        })}
        dir={dir}
        {...props}
      >
        {/* Header */}
        {header && (
          <div className={`p-4 ${isCollapsed ? "flex justify-center" : ""}`}>
            {header}
          </div>
        )}

        {/* Collapse Toggle */}
        {collapsible && (
          <button
            onClick={handleToggleCollapse}
            className={`
              mx-2 mb-2 p-2 rounded-lg transition-colors
              ${variant === "dark" ? "hover:bg-gray-800" : "hover:bg-gray-100"}
              ${isCollapsed ? "self-center" : "self-end"}
            `}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg
              className={`w-5 h-5 transition-transform ${
                isCollapsed ? (position === "right" ? "rotate-180" : "") : position === "right" ? "" : "rotate-180"
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
              />
            </svg>
          </button>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {allSections.map((section, sectionIndex) => (
            <div key={sectionIndex} className="mb-4">
              {section.title && !isCollapsed && (
                <h3 className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {section.title}
                </h3>
              )}
              <div className="space-y-1">
                {section.items.map((item) => (
                  <SidebarNavItem
                    key={item.id}
                    item={item}
                    collapsed={isCollapsed ?? false}
                    variant={variant}
                    onClick={() => onItemClick?.(item)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        {footer && (
          <div
            className={`p-4 border-t ${
              variant === "dark" ? "border-gray-800" : "border-gray-200"
            } ${isCollapsed ? "flex justify-center" : ""}`}
          >
            {footer}
          </div>
        )}
      </aside>
    );
  }
);

Sidebar.displayName = "Sidebar";

interface SidebarNavItemProps {
  item: SidebarItem;
  collapsed: boolean;
  variant?: "default" | "dark" | "transparent" | null;
  onClick?: () => void;
  depth?: number;
}

const SidebarNavItem: React.FC<SidebarNavItemProps> = ({
  item,
  collapsed,
  variant,
  onClick,
  depth = 0,
}) => {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = item.children && item.children.length > 0;

  const baseStyles = `
    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
    transition-colors cursor-pointer
  `;

  const variantStyles =
    variant === "dark"
      ? "text-gray-300 hover:bg-gray-800 hover:text-white"
      : "text-gray-700 hover:bg-gray-100";

  const activeStyles = item.active
    ? variant === "dark"
      ? "bg-gray-800 text-white"
      : "bg-blue-50 text-blue-600"
    : "";

  const disabledStyles = item.disabled
    ? "opacity-50 cursor-not-allowed pointer-events-none"
    : "";

  const paddingLeft = depth > 0 ? `pl-${4 + depth * 3}` : "";

  const handleClick = (e: React.MouseEvent) => {
    if (item.disabled) return;
    if (hasChildren) {
      e.preventDefault();
      setExpanded(!expanded);
    } else {
      onClick?.();
    }
  };

  const content = (
    <>
      {/* Icon */}
      <span className={`flex-shrink-0 ${collapsed ? "mx-auto" : ""}`}>
        {item.icon || (
          <span className="w-5 h-5 rounded-full bg-gray-300 dark:bg-gray-600" />
        )}
      </span>

      {/* Label & Badge */}
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge && (
            <span className="px-2 py-0.5 text-xs font-medium bg-red-500 text-white rounded-full">
              {item.badge}
            </span>
          )}
          {hasChildren && (
            <svg
              className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          )}
        </>
      )}
    </>
  );

  const Component = item.href && !hasChildren ? "a" : "button";
  const linkProps = item.href ? { href: item.href } : {};

  return (
    <div>
      <Component
        {...linkProps}
        className={`${baseStyles} ${variantStyles} ${activeStyles} ${disabledStyles} ${paddingLeft}`}
        onClick={handleClick}
        title={collapsed ? item.label : undefined}
      >
        {content}
      </Component>

      {/* Children */}
      {hasChildren && expanded && !collapsed && (
        <div className="mt-1">
          {item.children!.map((child) => (
            <SidebarNavItem
              key={child.id}
              item={child}
              collapsed={collapsed}
              variant={variant}
              onClick={onClick}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export { sidebarVariants };
