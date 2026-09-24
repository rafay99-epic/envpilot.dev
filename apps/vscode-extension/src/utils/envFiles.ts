export function envFileNameFor(environment: string): string {
  if (environment === "development") {
    return ".env.local";
  }
  return `.env.${environment}`;
}

export function envFileNamesFor(directory: {
  environments: string[];
  targetFile: string;
}): Map<string, string> {
  const map = new Map<string, string>();
  const { environments, targetFile } = directory;

  if (environments.length === 1) {
    map.set(environments[0], targetFile);
    return map;
  }

  for (const env of environments) {
    map.set(env, envFileNameFor(env));
  }
  return map;
}
