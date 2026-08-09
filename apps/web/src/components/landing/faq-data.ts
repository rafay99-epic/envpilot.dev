export const FAQ_ITEMS = [
  {
    question: "Where do my secrets actually live?",
    answer:
      "In WorkOS Vault, AES-256-GCM encrypted. Our database stores only reference IDs — a breach of our database yields zero plaintext secrets.",
  },
  {
    question: "What happens to my data if Envpilot shuts down?",
    answer:
      "Your variables are exportable at any time — bulk export from the dashboard or pull everything with the CLI. No lock-in by design.",
  },
  {
    question: "How is this different from Doppler or Infisical?",
    answer:
      "No per-seat pricing — one flat price per organization — and the whole platform is open source (MIT): run our zero-ops hosted cloud, or self-host it yourself. Built for small teams that share variables over Slack today, not for enterprise procurement.",
  },
  {
    question: "Is Envpilot open source?",
    answer:
      "Yes — the entire platform (web app, CLI, VS Code extension, and backend) is MIT-licensed on GitHub. Read the code, audit how your secrets are handled, self-host it, or contribute a pull request.",
  },
  {
    question: "What does the free plan include?",
    answer:
      "CLI, VS Code extension, and web dashboard for 3 projects and 3 teammates, with role-based access control and an audit log. No credit card required.",
  },
  {
    question: "Can I use it in CI/CD?",
    answer:
      "Yes — the GitHub Action and service tokens pull your variables into any pipeline, with values masked in workflow logs.",
  },
] as const;
