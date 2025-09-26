import { run, network } from "hardhat";

async function main() {
  const contractTargetsEnv = process.env.CONTRACT_TARGETS;
  const contractAddressEnv = process.env.CONTRACT_ADDRESS;

  type ContractTarget = { address: string; contract?: string };
  const targets: ContractTarget[] = [];

  if (contractTargetsEnv) {
    const rawTargets = contractTargetsEnv.split(",");
    for (const rawTarget of rawTargets) {
      const trimmed = rawTarget.trim();
      if (!trimmed) {
        continue;
      }
      const parts = trimmed.split("@").map(part => part.trim());
      if (parts.length === 1) {
        const [onlyValue] = parts;
        if (!onlyValue.startsWith("0x")) {
          throw new Error(`Invalid CONTRACT_TARGETS entry: ${trimmed}`);
        }
        targets.push({ address: onlyValue });
      } else if (parts.length === 2) {
        const [left, right] = parts;
        const addressCandidate = right.startsWith("0x") ? right : left;
        const contractCandidate = right.startsWith("0x") ? left : right;
        if (!addressCandidate.startsWith("0x")) {
          throw new Error(`Invalid CONTRACT_TARGETS entry: ${trimmed}`);
        }
        targets.push({ address: addressCandidate, contract: contractCandidate || undefined });
      } else {
        throw new Error(`Invalid CONTRACT_TARGETS entry: ${trimmed}`);
      }
    }
  }

  if (targets.length === 0 && contractAddressEnv) {
    const contractAddresses = contractAddressEnv
      .split(",")
      .map(address => address.trim())
      .filter(address => address.length > 0);

    for (const address of contractAddresses) {
      targets.push({ address });
    }
  }

  if (targets.length === 0) {
    throw new Error("Missing CONTRACT_ADDRESS or CONTRACT_TARGETS environment variable");
  }

  const constructorArgsPath = process.env.CONSTRUCTOR_ARGS_PATH;
  const contractFqn = process.env.CONTRACT_FQN;
  const librariesModulePath = process.env.LIBRARIES_PATH;
  const skipCompile = process.env.NO_COMPILE === "true";
  const isProxy = process.env.IS_PROXY === "true";
  const showNetworks = process.env.LIST_OKX_NETWORKS === "true";

  if (showNetworks) {
    await run("okverify", { listNetworks: true });
    return;
  }

  if (!process.env.OKLINK_API_KEY) {
    console.warn("Warning: OKLINK_API_KEY is not set; verification will fail on the explorer API.");
  }

  for (const target of targets) {
    const taskArgs: Record<string, unknown> = { address: target.address };

    if (constructorArgsPath) {
      taskArgs.constructorArgs = constructorArgsPath;
    }
    const resolvedContract = target.contract || contractFqn;
    if (resolvedContract) {
      taskArgs.contract = resolvedContract;
    }
    if (librariesModulePath) {
      taskArgs.libraries = librariesModulePath;
    }
    if (skipCompile) {
      taskArgs.noCompile = true;
    }
    if (isProxy) {
      taskArgs.proxy = true;
    }

    console.log(`Verifying ${target.address} on network ${network.name}${resolvedContract ? ` with contract ${resolvedContract}` : ""}`);

    await run("okverify", taskArgs);

    console.log(`Explorer verification submitted for ${target.address}; check the explorer for the final status.`);
  }
}

main().catch(error => {
  console.error("Verification failed:", error);
  process.exitCode = 1;
});
