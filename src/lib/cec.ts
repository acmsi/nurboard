import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const CEC_ENABLED = Deno.env.get("CEC_ENABLED") !== "false";

async function cecSend(command: string): Promise<string> {
  if (!CEC_ENABLED) {
    console.log(`[cec] disabled — would send: ${command}`);
    return "";
  }

  try {
    const { stdout } = await execAsync(
      `echo "${command}" | cec-client -s -d 1`,
    );
    return stdout;
  } catch (error) {
    console.error("[cec] command failed:", error);
    return "";
  }
}

export async function tvOn(): Promise<void> {
  console.log("[cec] turning TV on");
  await cecSend("on 0");
}

export async function tvOff(): Promise<void> {
  console.log("[cec] TV standby");
  await cecSend("standby 0");
}

export type TvPowerStatus = "on" | "standby" | "unknown" | "disabled";

export async function tvStatus(): Promise<TvPowerStatus> {
  if (!CEC_ENABLED) return "disabled";
  const output = await cecSend("pow 0");
  if (output.includes("power status: on")) return "on";
  if (output.includes("power status: standby")) return "standby";
  return "unknown";
}
