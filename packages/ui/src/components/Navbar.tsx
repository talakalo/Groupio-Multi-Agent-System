"use client";

import React, { useState } from "react";
import { cva, type VariantProps } from "class-variance-authority";

const navbarVariants = cva(
  "w-full flex items-center justify-between px-4 md:px-6",
  {
    variants: {
      variant: {
        default: "bg-white border-b border-gray-200",
        transparent: "bg-transparent",
        dark: "bg-gray-900 text-white",
        primary: "bg-blue-600 text-white",
      },
      size: {
        sm: "h-12",
        md: "h-14",
        lg: "h-16",
      },
      sticky: {
        true: "sticky top-0 z-50",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
      sticky: true,
    },
  }
);

export interface NavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
  badge?: string | number;
  active?: boolean;
  children?: NavItem[];
}

export interface NavbarProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof navbarVariants> {
  logo?: React.ReactNode;
  items?: NavItem[];
  actions?: React.ReactNode;
  mobileMenuContent?: React.ReactNode;
  onItemClick?: (item: NavItem) => void;
  dir?: "ltr" | "rtl";
}

export const Navbar = React.forwardRef<HTMLElement, NavbarProps>(
  (
    {
      className,
      variant,
      size,
      sticky,
      logo,
      items = [],
      actions,
      mobileMenuContent,
      onItemClick,
      dir = "ltr",
      ...props
    },
    ref
  ) => {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const handleItemClick = (item: NavItem) => {
      onItemClick?.(item);
      setMobileMenuOpen(false);
    };

    return (
      <nav
        ref={ref}
        className={navbarVariants({ variant, size, sticky, className })}
        dir={dir}
        {...props}
      >
        {/* Logo */}
        <div className="flex items-center gap-4">
          {logo}
        </div>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-1">
          {items.map((item, index) => (
            <NavbarItem
              key={index}
              item={item}
              variant={variant}
              onClick={() => handleItemClick(item)}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {actions}

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {mobileMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="absolute top-full left-0 right-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 md:hidden shadow-lg">
            <div className="py-2 px-4">
              {items.map((item, index) => (
                <MobileNavItem
                  key={index}
                  item={item}
                  onClick={() => handleItemClick(item)}
                />
              ))}
              {mobileMenuContent}
            </div>
          </div>
        )}
      </nav>
    );
  }
);

Navbar.displayName = "Navbar";

interface NavbarItemProps {
  item: NavItem;
  variant?: "default" | "transparent" | "dark" | "primary" | null;
  onClick?: () => void;
}

const NavbarItem: React.FC<NavbarItemProps> = ({ item, variant, onClick }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const hasChildren = item.children && item.children.length > 0;

  const baseStyles = `
    px-3 py-2 rounded-lg text-sm font-medium transition-colors
    flex items-center gap-2 relative
  `;

  const variantStyles =
    variant === "dark" || variant === "primary"
      ? "hover:bg-white/10 text-white"
      : "hover:bg-gray-100 text-gray-700";

  const activeStyles = item.active
    ? variant === "dark" || variant === "primary"
      ? "bg-white/20"
      : "bg-gray-100 text-blue-600"
    : "";

  return (
    <div
      className="relative"
      onMouseEnter={() => hasChildren && setDropdownOpen(true)}
      onMouseLeave={() => hasChildren && setDropdownOpen(false)}
    >
      <button
        className={`${baseStyles} ${variantStyles} ${activeStyles}`}
        onClick={onClick}
      >
        {item.icon}
        <span>{item.label}</span>
        {item.badge && (
          <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
            {item.badge}
          </span>
        )}
        {hasChildren && (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {/* Dropdown */}
      {hasChildren && dropdownOpen && (
        <div className="absolute top-full left-0 mt-1 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 min-w-[200px] z-50">
          {item.children!.map((child, index) => (
            <a
              key={index}
              href={child.href}
              className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className="flex items-center gap-2">
                {child.icon}
                {child.label}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

interface MobileNavItemProps {
  item: NavItem;
  onClick?: () => void;
  depth?: number;
}

const MobileNavItem: React.FC<MobileNavItemProps> = ({
  item,
  onClick,
  depth = 0,
}) => {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = item.children && item.children.length > 0;

  return (
    <div>
      <button
        className={`
          w-full flex items-center justify-between py-3 text-left
          text-gray-700 dark:text-gray-200 hover:text-blue-600
          ${depth > 0 ? "pl-4" : ""}
          ${item.active ? "text-blue-600 font-medium" : ""}
        `}
        onClick={() => {
          if (hasChildren) {
            setExpanded(!expanded);
          } else {
            onClick?.();
          }
        }}
      >
        <div className="flex items-center gap-2">
          {item.icon}
          <span>{item.label}</span>
          {item.badge && (
            <span className="px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
              {item.badge}
            </span>
          )}
        </div>
        {hasChildren && (
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {hasChildren && expanded && (
        <div className="border-l-2 border-gray-200 dark:border-gray-700 ml-2">
          {item.children!.map((child, index) => (
            <MobileNavItem
              key={index}
              item={child}
              onClick={onClick}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export { navbarVariants };
