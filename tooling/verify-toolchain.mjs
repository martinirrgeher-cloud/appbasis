const expectedNode = "v24.19.0";
const expectedPnpm = "11.21.0";

let failed = false;

if (process.version !== expectedNode) {
  console.error(
    `FAIL Node: erwartet ${expectedNode}, gefunden ${process.version}`,
  );
  failed = true;
} else {
  console.log(`PASS Node ${process.version}`);
}

const userAgent = process.env.npm_config_user_agent ?? "";
const pnpmMatch = userAgent.match(/pnpm\/([^\s]+)/);
const actualPnpm = pnpmMatch?.[1];

if (actualPnpm !== expectedPnpm) {
  console.error(
    `FAIL pnpm: erwartet ${expectedPnpm}, gefunden ${actualPnpm ?? "unbekannt"}`,
  );
  failed = true;
} else {
  console.log(`PASS pnpm ${actualPnpm}`);
}

if (failed) {
  process.exit(1);
}

console.log("PASS AppBasis Toolchain");