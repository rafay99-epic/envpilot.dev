import * as vscode from "vscode";
import type { Project } from "../types";

export interface VariableRequestInput {
  key: string;
  value: string;
  description?: string;
  environments: string[];
  projectId: string;
  isSensitive: boolean;
}

export class RequestVariableDialog {
  async showRequestDialog(
    project: Project,
    allowedEnvironments?: string[]
  ): Promise<VariableRequestInput | undefined> {
    const title = (step: number) =>
      `Request Variable (${step}/5) · ${project.name}`;

    const key = await vscode.window.showInputBox({
      title: title(1),
      prompt: "Enter the variable key name",
      placeHolder: "e.g., API_KEY, DATABASE_URL",
      validateInput: (value) => {
        if (!value) {
          return "Key is required";
        }
        if (!/^[A-Z][A-Z0-9_]*$/.test(value)) {
          return "Must be uppercase, start with a letter, and contain only letters, numbers, and underscores";
        }
        if (value.length > 100) {
          return "Key must be 100 characters or less";
        }
        return undefined;
      },
    });
    if (!key) {
      return undefined;
    }

    const value = await vscode.window.showInputBox({
      title: title(2),
      prompt: `Enter the value for ${key}`,
      placeHolder: "Variable value",
      password: true,
      validateInput: (v) => {
        if (!v) {
          return "Value is required";
        }
        return undefined;
      },
    });
    if (!value) {
      return undefined;
    }

    const description = await vscode.window.showInputBox({
      title: title(3),
      prompt: "Enter a description (optional, press Enter to skip)",
      placeHolder: "What is this variable used for?",
    });
    if (description === undefined) {
      return undefined;
    }

    const allEnvChoices = [
      { label: "Development", value: "development" },
      { label: "Staging", value: "staging" },
      { label: "Production", value: "production" },
    ];
    const envChoices = allowedEnvironments
      ? allEnvChoices.filter((c) => allowedEnvironments.includes(c.value))
      : allEnvChoices;
    if (envChoices.length === 0) {
      vscode.window.showWarningMessage(
        "You don't have access to any environments in this project."
      );
      return undefined;
    }
    const envItems = await vscode.window.showQuickPick(
      envChoices.map((c, i) => ({ ...c, picked: i === 0 })),
      {
        title: title(4),
        placeHolder: allowedEnvironments
          ? "Select environments (limited to your access)"
          : "Select environments for this variable",
        canPickMany: true,
      }
    );
    if (!envItems || envItems.length === 0) {
      return undefined;
    }
    const environments = envItems.map((item) => item.value);

    const sensitiveChoice = await vscode.window.showQuickPick(
      [
        { label: "No", description: "Regular variable", value: false },
        {
          label: "Yes",
          description: "Secret, credential, or API key",
          value: true,
        },
      ],
      {
        title: title(5),
        placeHolder: "Is this a sensitive value (secret/credential)?",
      }
    );
    if (!sensitiveChoice) {
      return undefined;
    }

    return {
      key,
      value,
      description: description || undefined,
      environments,
      projectId: project._id,
      isSensitive: sensitiveChoice.value,
    };
  }
}
