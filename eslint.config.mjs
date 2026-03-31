import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: ["node_modules/", ".next/", "public/sw.js"],
  },
];

export default eslintConfig;
