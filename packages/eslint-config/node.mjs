import baseConfig from "./base.mjs";

const nodeConfig = [
  ...baseConfig,
  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-expressions": "off",
      "no-unused-expressions": "off",
    },
  },
];

export default nodeConfig;
