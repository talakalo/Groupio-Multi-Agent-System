import type { Preview } from "@storybook/react";

const preview: Preview = {
  parameters: {
    // Apply a light/dark background toggle matching the app's palette
    backgrounds: {
      default: "light",
      values: [
        { name: "light", value: "#ffffff" },
        { name: "slate", value: "#f8fafc" },
        { name: "dark", value: "#0f172a" },
      ],
    },

    // Default viewport set — includes mobile breakpoints for RTL testing
    viewport: {
      viewports: {
        mobile: { name: "Mobile (375px)", styles: { width: "375px", height: "812px" } },
        tablet: { name: "Tablet (768px)", styles: { width: "768px", height: "1024px" } },
        desktop: { name: "Desktop (1280px)", styles: { width: "1280px", height: "900px" } },
      },
      defaultViewport: "desktop",
    },

    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },

    // Auto-generate a Docs page for every component that has the "autodocs" tag
    docs: {
      toc: true,
    },
  },
};

export default preview;
