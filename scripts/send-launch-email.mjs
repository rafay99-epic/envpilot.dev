// One-off bulk mailer: sends personalized emails via Gmail SMTP using the
// abdul@envpilot.dev send-as alias. Each recipient gets an individual email.
//
// Dry run (prints, sends nothing):  bun scripts/send-launch-email.mjs
// Send for real:                    GMAIL_APP_PASSWORD='xxxx xxxx xxxx xxxx' bun scripts/send-launch-email.mjs --send
//
// GMAIL_APP_PASSWORD = Gmail app password for syntaxlabtechnology@gmail.com
// (myaccount.google.com/apppasswords). Edit USERS/SUBJECT/body per campaign.
import nodemailer from "nodemailer";

const USERS = [
  { email: "ccawa6688@gmail.com", greeting: "Hi there" },
  { email: "shaxuan150@gmail.com", greeting: "Hi there" },
  { email: "wangliguang66@gmail.com", greeting: "Hi there" },
  { email: "j2030ai@gmail.com", greeting: "Hi Tee" },
  { email: "wisamokkeh2@gmail.com", greeting: "Hi Wisam" },
  { email: "karem20184@gmail.com", greeting: "Hi Abdu" },
  { email: "danieleistien@gmail.com", greeting: "Hi Daniel" },
  { email: "kemalcan.yaprak1@gmail.com", greeting: "Hi Kemal" },
  { email: "xerrs.rs@gmail.com", greeting: "Hi there" },
];

const SUBJECT = "EnvPilot is officially live — your first month for just $1 🎉";

const body = (greeting) => `${greeting},

I'm Abdul Rafay, CEO of Syntax Lab Technology — reaching out personally because you were one of EnvPilot's earliest users.

Today's a big day: EnvPilot has officially launched! 🚀

Since you signed up, we've shipped a lot:

• Pro plans are now live — advanced features officially available
• Public REST API & MCP server — pull your secrets programmatically or straight into your AI tools
• GitHub Action — sync environment variables into your CI/CD pipelines
• Secret rotation reminders — never let a stale credential slip through
• Shared accounts, audit logs, version history, and a revamped dashboard

A launch gift 🎁

As an early user, you get 90% off your first month of Pro — that's just $1. Use code FIRSTLAUNCH at checkout: https://www.envpilot.dev

And one honest question…

I'd genuinely love to know — how has EnvPilot been for you? Was anything confusing, missing, or not fitting your workflow? Just hit reply and tell me. I read every response personally, and your feedback directly shapes what we build next.

Thank you for being with EnvPilot from the very beginning.

Warm regards,
Abdul Rafay
CEO, Syntax Lab Technology
https://www.envpilot.dev · support@envpilot.dev
`;

const send = process.argv.includes("--send");

if (!send) {
  console.log(`DRY RUN — nothing will be sent. Re-run with --send to send for real.\n`);
  for (const u of USERS) {
    console.log(`To: ${u.email}\nSubject: ${SUBJECT}\n${body(u.greeting).slice(0, 120)}...\n---`);
  }
  console.log(`\n${USERS.length} emails ready.`);
  process.exit(0);
}

const pass = process.env.GMAIL_APP_PASSWORD;
if (!pass) {
  console.error("Set GMAIL_APP_PASSWORD env var (the 16-char Gmail app password).");
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: { user: "syntaxlabtechnology@gmail.com", pass },
});

for (const u of USERS) {
  try {
    await transporter.sendMail({
      from: '"Abdul Rafay" <abdul@envpilot.dev>',
      to: u.email,
      subject: SUBJECT,
      text: body(u.greeting),
    });
    console.log(`✅ sent → ${u.email}`);
  } catch (err) {
    console.error(`❌ FAILED → ${u.email}: ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, 2000)); // ponytail: 2s gap, gmail rate-limit safety
}
console.log("Done.");
