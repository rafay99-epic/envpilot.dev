import * as os from "os";
import * as crypto from "crypto";
import * as vscode from "vscode";
import type { DeviceInfo } from "../types";

const DEVICE_ID_KEY = "envpilot.deviceId";

export async function getDeviceId(
  context: vscode.ExtensionContext
): Promise<string> {
  let deviceId = context.globalState.get<string>(DEVICE_ID_KEY);

  if (!deviceId) {
    deviceId = `vscode_${crypto.randomUUID()}`;
    await context.globalState.update(DEVICE_ID_KEY, deviceId);
  }

  return deviceId;
}

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

export async function getDeviceInfo(
  context: vscode.ExtensionContext
): Promise<DeviceInfo> {
  return {
    deviceId: await getDeviceId(context),
    deviceName: getDeviceName(),
  };
}
