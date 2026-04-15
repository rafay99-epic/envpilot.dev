declare const __CLI_VERSION__: string;

export const CLI_VERSION =
  typeof __CLI_VERSION__ !== "undefined" ? __CLI_VERSION__ : "0.0.0";
