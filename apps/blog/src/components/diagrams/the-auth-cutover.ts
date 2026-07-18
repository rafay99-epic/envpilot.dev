export const diagrams = {
  "the-auth-cutover-bridge": `flowchart TD
    CLI["CLI / VS Code extension"] -->|"Bearer opaque cliTokens.accessToken"| R["Next.js routes<br/>/api/cli/* and /api/extension/*"]
    R --> V["validateCLIToken()<br/>api.cliSessions.validateToken"]
    V -->|"resolves a userId"| Q["convex.query(getMembership, organizationId + userId)"]
    Q --> C
    B["Browser"] -->|"userId over unauthenticated WS"| C
    X["Anyone with NEXT_PUBLIC_CONVEX_URL"] -->|"can send any userId"| C
    C["Convex<br/>believes userId, verifies nothing"]`,

  "the-auth-cutover-login-before": `sequenceDiagram
    participant CLI as envpilot login
    participant API as /api/cli/auth
    participant CX as Convex cliSessions
    participant H as Human
    CLI->>API: POST action=initiate
    API->>CX: api.cliSessions.initiate
    CX-->>API: code
    API-->>CLI: code
    H->>API: approves at www.envpilot.dev/cli/auth?code=XXXX (our page, our UI)
    CLI->>API: GET action=poll&code=XXXX
    API-->>CLI: opaque accessToken + refreshToken
    Note over API,CX: Tokens stored server-side in cliTokens`,

  "the-auth-cutover-login-after": `sequenceDiagram
    participant CLI as envpilot login
    participant W as WorkOS
    participant H as Human
    participant CX as Convex
    CLI->>W: requestDeviceCode (POST /user_management/authorize/device)
    W-->>CLI: user_code, verification_uri_complete, interval, expires_in
    H->>W: approves on the WorkOS-hosted page (not our page, not our UI)
    loop until expiry, interval +5s on slow_down
      CLI->>W: pollForToken(device_code)
      W-->>CLI: pending / slow_down / denied / expired
    end
    Note over CLI,W: grant_type=urn:ietf:params:oauth:grant-type:device_code
    W-->>CLI: access_token (5 min), refresh_token, user
    CLI->>CLI: getJwtSessionId(access_token) gives sid
    CLI->>CX: recordDeviceSession(deviceName, sid)
    Note over CLI,CX: cliTokens row is DISPLAY only. The JWT is never stored server-side.`,

  "the-auth-cutover-verified-identity": `flowchart TD
    B["Browser"] -->|"AuthKit JWT"| AC
    C["CLI"] -->|"WorkOS JWT"| AC
    E["VS Code extension"] -->|"WorkOS JWT"| AC
    AC["convex/auth.config.ts<br/>customJwt x 2<br/>JWKS: api.workos.com/sso/jwks/{clientId}"]
    N["PR 87: per-deployment<br/>clientId = process.env.WORKOS_CLIENT_ID"] -.- AC
    AC -->|"ctx.auth.getUserIdentity().subject"| ID["convex/lib/identity.ts<br/>getAuthedUser / requireAuthedUser<br/>users.by_workos_id"]
    ID --> F["every query/mutation:<br/>args have NO userId"]`,
} as const;
