import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  { ignores: ["public/maplibre-gl-worker.mjs"] },
  ...nextVitals,
  ...nextTypeScript,
];

export default config;
