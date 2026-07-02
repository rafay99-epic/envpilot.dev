import * as os from "os";
import * as crypto from "crypto";
import * as vscode from "vscode";
import type { DeviceInfo } from "../types";

const DEVICE_ID_KEY = "envpilot.deviceId";

/**
 * Get or generate a unique device ID for this VS Code installation
 */
export async function getDeviceId(
  context: vscode.ExtensionContext
): Promise<string> {
  let deviceId = context.globalState.get<string>(DEVICE_ID_KEY);

  if (!deviceId) {
    // Generate a random, per-installation identifier and persist it. Deriving
    // this from hostname/username/platform (as before) collides across VMs
    // cloned from the same golden image or shared build boxes with a common
    // service username — a random UUID, cached once in globalState, is
    // unique per installation regardless of machine characteristics.
    deviceId = `vscode_${crypto.randomUUID()}`;
    await context.globalState.update(DEVICE_ID_KEY, deviceId);
  }

  return deviceId;
}

/**
 * Get a human-readable device name
 */
export function getDeviceName(): string {
  const hostname = os.hostname();
  const platform = getPlatformName();
  const editor = getEditorName();

  return `${editor} - ${hostname} (${platform})`;
}

function getPlatformName(): string {
  const platform = os.platform();

  switch (platform) {
    case "darwin":
      return "macOS";
    case "win32":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return platform;
  }
}

function getEditorName(): string {
  const appName = vscode.env.appName;

  if (appName.toLowerCase().includes("cursor")) {
    return "Cursor";
  }

  return "VS Code";
}

/**
 * Get full device info for extension linking
 */
export async function getDeviceInfo(
  context: vscode.ExtensionContext
): Promise<DeviceInfo> {
  return {
    deviceId: await getDeviceId(context),
    deviceName: getDeviceName(),
  };
}
