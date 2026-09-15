import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Roblox identity is read through the shared loader so
    // ROBLOX_IDENTITY_SOURCE (json | db) applies everywhere.
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/config/roblox-universe-ids.ts",
      "src/lib/queries/roblox-identity.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/roblox-universe-ids", "**/roblox-universe-ids.json"],
              message:
                "Read Roblox identity through @/lib/queries/roblox-identity instead.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
