import * as vscode from "vscode";

export interface VariableRequestInput {
  key: string;
  value: string;
  description?: string;
  environments: string[];
  projectId: string;
  isSensitive: boolean;
}

/**
 * Multi-step dialog for requesting a new environment variable.
 * Used by members who cannot create variables directly.
 */
export class RequestVariableDialog {
  /**
   * Show the variable request dialog and collect all inputs.
   * Returns undefined if the user cancels at any step.
   */
  async showRequestDialog(
    projectId: string,
  ): Promise<VariableRequestInput | undefined> {
    // Step 1: Key name
    const key = await vscode.window.showInputBox({
      title: "Request Variable (1/5) - Key",
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

    // Step 2: Value
    const value = await vscode.window.showInputBox({
      title: "Request Variable (2/5) - Value",
      prompt: `Enter the value for ${key}`,
      placeHolder: "Variable value",
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

    // Step 3: Description (optional)
    const description = await vscode.window.showInputBox({
      title: "Request Variable (3/5) - Description",
      prompt: "Enter a description (optional, press Enter to skip)",
      placeHolder: "What is this variable used for?",
    });
    // Don't return on empty — description is optional
    if (description === undefined) {
      return undefined; // User pressed Escape
    }

    // Step 4: Environment selection
    const envItems = await vscode.window.showQuickPick(
      [
        { label: "Development", value: "development", picked: true },
        { label: "Staging", value: "staging" },
        { label: "Production", value: "production" },
      ],
      {
        title: "Request Variable (4/5) - Environments",
        placeHolder: "Select environments for this variable",
        canPickMany: true,
      },
    );
    if (!envItems || envItems.length === 0) {
      return undefined;
    }
    const environments = envItems.map((item) => item.value);

    // Step 5: Sensitive flag
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
        title: "Request Variable (5/5) - Sensitive?",
        placeHolder: "Is this a sensitive value (secret/credential)?",
      },
    );
    if (!sensitiveChoice) {
      return undefined;
    }

    return {
      key,
      value,
      description: description || undefined,
      environments,
      projectId,
      isSensitive: sensitiveChoice.value,
    };
  }
}
