import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  // Discover all *.stories.tsx files anywhere under src/
  stories: ["../src/**/*.stories.@(ts|tsx)"],

  addons: [
    "@storybook/addon-essentials",  // controls, actions, docs, viewport, backgrounds
    "@storybook/addon-interactions", // play() function testing
    "@storybook/addon-a11y",        // accessibility checks per story
    "@chromatic-com/storybook",     // Chromatic visual regression integration
  ],

  framework: {
    name: "@storybook/react-vite",
    options: {},
  },

  docs: {
    // Auto-generate a Docs page from the component's JSDoc + controls
    autodocs: "tag",
  },

  typescript: {
    // Type-check stories as part of the Storybook build
    check: false,
    reactDocgen: "react-docgen-typescript",
  },
};

export default config;
