"use client";

import React from "react";
import { cva, type VariantProps } from "class-variance-authority";

const footerVariants = cva("w-full", {
  variants: {
    variant: {
      default: "bg-white border-t border-gray-200",
      dark: "bg-gray-900 text-white",
      transparent: "bg-transparent",
      primary: "bg-blue-600 text-white",
    },
    size: {
      sm: "py-4",
      md: "py-8",
      lg: "py-12",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "md",
  },
});

export interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface FooterSection {
  title: string;
  links: FooterLink[];
}

export interface SocialLink {
  name: string;
  href: string;
  icon: React.ReactNode;
}

export interface FooterProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof footerVariants> {
  logo?: React.ReactNode;
  description?: string;
  sections?: FooterSection[];
  socialLinks?: SocialLink[];
  copyright?: string;
  bottomLinks?: FooterLink[];
  newsletter?: {
    title?: string;
    placeholder?: string;
    buttonText?: string;
    onSubmit?: (email: string) => void;
  };
  dir?: "ltr" | "rtl";
}

export const Footer = React.forwardRef<HTMLElement, FooterProps>(
  (
    {
      className,
      variant,
      size,
      logo,
      description,
      sections = [],
      socialLinks = [],
      copyright,
      bottomLinks = [],
      newsletter,
      dir = "ltr",
      ...props
    },
    ref
  ) => {
    const [email, setEmail] = React.useState("");

    const handleNewsletterSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      newsletter?.onSubmit?.(email);
      setEmail("");
    };

    const textColor = variant === "dark" || variant === "primary" ? "text-gray-400" : "text-gray-600";
    const headingColor = variant === "dark" || variant === "primary" ? "text-white" : "text-gray-900";
    const borderColor = variant === "dark" ? "border-gray-800" : "border-gray-200";

    return (
      <footer
        ref={ref}
        className={footerVariants({ variant, size, className })}
        dir={dir}
        {...props}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Main Footer Content */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 pb-8">
            {/* Brand Section */}
            <div className="lg:col-span-1">
              {logo && <div className="mb-4">{logo}</div>}
              {description && (
                <p className={`text-sm ${textColor} mb-4`}>{description}</p>
              )}

              {/* Social Links */}
              {socialLinks.length > 0 && (
                <div className="flex gap-4">
                  {socialLinks.map((social, index) => (
                    <a
                      key={index}
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${textColor} hover:text-blue-500 transition-colors`}
                      aria-label={social.name}
                    >
                      {social.icon}
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Link Sections */}
            {sections.map((section, index) => (
              <div key={index}>
                <h4 className={`font-semibold ${headingColor} mb-4`}>
                  {section.title}
                </h4>
                <ul className="space-y-2">
                  {section.links.map((link, linkIndex) => (
                    <li key={linkIndex}>
                      <a
                        href={link.href}
                        target={link.external ? "_blank" : undefined}
                        rel={link.external ? "noopener noreferrer" : undefined}
                        className={`text-sm ${textColor} hover:text-blue-500 transition-colors`}
                      >
                        {link.label}
                        {link.external && (
                          <svg
                            className="inline-block w-3 h-3 ml-1"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* Newsletter */}
            {newsletter && (
              <div>
                <h4 className={`font-semibold ${headingColor} mb-4`}>
                  {newsletter.title || "Subscribe"}
                </h4>
                <form onSubmit={handleNewsletterSubmit} className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={newsletter.placeholder || "Enter your email"}
                    required
                    className={`
                      flex-1 px-3 py-2 text-sm rounded-lg border
                      ${variant === "dark" ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-300"}
                      focus:outline-none focus:ring-2 focus:ring-blue-500
                    `}
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {newsletter.buttonText || "Subscribe"}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Bottom Bar */}
          <div
            className={`pt-8 border-t ${borderColor} flex flex-col md:flex-row justify-between items-center gap-4`}
          >
            {/* Copyright */}
            <p className={`text-sm ${textColor}`}>
              {copyright || `© ${new Date().getFullYear()} All rights reserved.`}
            </p>

            {/* Bottom Links */}
            {bottomLinks.length > 0 && (
              <div className="flex gap-6">
                {bottomLinks.map((link, index) => (
                  <a
                    key={index}
                    href={link.href}
                    target={link.external ? "_blank" : undefined}
                    rel={link.external ? "noopener noreferrer" : undefined}
                    className={`text-sm ${textColor} hover:text-blue-500 transition-colors`}
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </footer>
    );
  }
);

Footer.displayName = "Footer";

export { footerVariants };
