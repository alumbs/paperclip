export function hasWindsurfTrustBypassArg(args: readonly string[]): boolean {
  return args.some(
    (arg) =>
      arg === "--trust" ||
      arg === "-f" ||
      arg.startsWith("--trust="),
  );
}
