/**
 * Pure functions for generating the Dashboard Webview HTML, CSS, and JS.
 * Ports the terminal-themed UI from the web app into vanilla HTML/CSS.
 */

export function getDashboardCss(): string {
  return `
    :root {
      --bg-terminal: #0f172a;
      --bg-card: rgba(24, 24, 27, 0.9);
      --bg-card-hover: #27272a;
      --bg-titlebar: rgba(39, 39, 42, 0.8);
      --border: rgba(113, 113, 122, 0.5);
      --border-light: rgba(113, 113, 122, 0.2);
      --green: #22c55e;
      --green-light: #4ade80;
      --green-glow: rgba(34, 197, 94, 0.15);
      --amber: #fbbf24;
      --red: #ef5350;
      --blue: #60a5fa;
      --purple: #c084fc;
      --text-primary: #f4f4f5;
      --text-secondary: #a1a1aa;
      --text-dim: #71717a;
      --font-mono: 'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', 'Menlo', monospace;
      --radius: 8px;
      --radius-sm: 6px;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: var(--bg-terminal);
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-size: 13px;
      line-height: 1.6;
      padding: 20px;
      overflow-x: hidden;
    }

    /* === Terminal Window === */
    .terminal-window {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--bg-card);
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
      margin-bottom: 16px;
    }
    .terminal-titlebar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      background: var(--bg-titlebar);
      border-bottom: 1px solid var(--border);
    }
    .traffic-lights { display: flex; gap: 6px; }
    .dot { width: 12px; height: 12px; border-radius: 50%; }
    .dot-red { background: rgba(239, 83, 80, 0.8); }
    .dot-yellow { background: rgba(251, 191, 36, 0.8); }
    .dot-green { background: rgba(34, 197, 94, 0.8); }
    .titlebar-text {
      font-size: 12px;
      color: var(--text-dim);
      margin-left: 8px;
      flex: 1;
    }
    .terminal-body { padding: 20px; }

    /* === Terminal Card === */
    .terminal-card {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--bg-card);
      padding: 16px;
      margin-bottom: 12px;
      transition: border-color 0.2s ease;
    }
    .terminal-card:hover { border-color: rgba(34, 197, 94, 0.4); }

    /* === Buttons === */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: var(--radius-sm);
      border: 1px solid;
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      background: transparent;
      text-decoration: none;
    }
    .btn:hover { transform: translateY(-1px); }
    .btn-primary {
      border-color: rgba(34, 197, 94, 0.3);
      background: var(--green-glow);
      color: var(--green-light);
    }
    .btn-primary:hover {
      background: rgba(34, 197, 94, 0.25);
      box-shadow: 0 0 16px rgba(34, 197, 94, 0.2);
    }
    .btn-secondary {
      border-color: var(--border);
      color: var(--text-secondary);
    }
    .btn-secondary:hover {
      border-color: #52525b;
      color: #d4d4d8;
    }
    .btn-danger {
      border-color: rgba(239, 83, 80, 0.3);
      background: rgba(239, 83, 80, 0.1);
      color: var(--red);
    }
    .btn-danger:hover { background: rgba(239, 83, 80, 0.2); }
    .btn-sm { padding: 4px 10px; font-size: 11px; }
    .btn-icon {
      padding: 4px 8px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text-dim);
      cursor: pointer;
      border-radius: var(--radius-sm);
      font-family: var(--font-mono);
      font-size: 12px;
      transition: all 0.2s;
    }
    .btn-icon:hover { color: var(--text-primary); border-color: var(--text-dim); }

    /* === Badges === */
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 10px;
      border-radius: 9999px;
      border: 1px solid;
      font-size: 11px;
      font-weight: 500;
    }
    .badge-green { background: rgba(34,197,94,0.1); color: var(--green-light); border-color: rgba(34,197,94,0.2); }
    .badge-amber { background: rgba(251,191,36,0.1); color: var(--amber); border-color: rgba(251,191,36,0.2); }
    .badge-red { background: rgba(239,83,80,0.1); color: var(--red); border-color: rgba(239,83,80,0.2); }
    .badge-zinc { background: #27272a; color: var(--text-secondary); border-color: #3f3f46; }
    .badge-blue { background: rgba(59,130,246,0.1); color: var(--blue); border-color: rgba(59,130,246,0.2); }

    /* === Header === */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    .header-left { display: flex; align-items: center; gap: 8px; font-size: 15px; }
    .header-right { display: flex; align-items: center; gap: 8px; }

    /* === Stats Row === */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .stat-card {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--bg-card);
      padding: 20px 16px;
      text-align: center;
      transition: border-color 0.2s;
    }
    .stat-card:hover { border-color: rgba(34, 197, 94, 0.3); }
    .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: var(--green-light);
      line-height: 1;
    }
    .stat-label {
      font-size: 10px;
      color: var(--text-dim);
      margin-top: 8px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    /* === Directory Row === */
    .dir-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid var(--border-light);
    }
    .dir-row:last-child { border-bottom: none; }
    .dir-info { flex: 1; min-width: 0; }
    .dir-path {
      color: var(--text-primary);
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dir-meta {
      color: var(--text-dim);
      font-size: 11px;
      margin-top: 3px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .dir-actions { display: flex; gap: 6px; margin-left: 12px; flex-shrink: 0; }

    /* === Sync Status === */
    .sync-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }
    .sync-fresh { background: var(--green); box-shadow: 0 0 6px rgba(34, 197, 94, 0.5); }
    .sync-stale { background: var(--amber); }
    .sync-never { background: #3f3f46; }
    .sync-spinning {
      width: 12px; height: 12px;
      border: 2px solid var(--border);
      border-top-color: var(--green);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* === Loading / Cursor === */
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
    .cursor {
      display: inline-block;
      width: 8px;
      height: 15px;
      background: var(--green);
      animation: blink 1s step-end infinite;
      vertical-align: text-bottom;
      margin-left: 2px;
    }

    /* === Actions Bar === */
    .actions-bar {
      display: flex;
      gap: 8px;
      margin-top: 20px;
      flex-wrap: wrap;
    }

    /* === Prompt Line === */
    .prompt { color: var(--green-light); }
    .prompt-line {
      color: var(--text-dim);
      margin-bottom: 8px;
      font-size: 13px;
    }

    /* === Center Content === */
    .center-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      text-align: center;
      gap: 16px;
    }
    .center-content p { color: var(--text-secondary); max-width: 360px; }

    /* === Section Label === */
    .section-label {
      font-size: 10px;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 12px;
      padding-left: 2px;
    }

    /* === Project Header === */
    .project-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 16px;
    }
    .project-name { font-size: 16px; color: var(--green-light); font-weight: 600; }
    .project-org { font-size: 12px; color: var(--text-dim); margin-top: 2px; }

    /* === Utility === */
    .hidden { display: none !important; }
    .text-green { color: var(--green-light); }
    .text-dim { color: var(--text-dim); }
    .text-secondary { color: var(--text-secondary); }
    .mt-4 { margin-top: 16px; }
    .mb-4 { margin-bottom: 16px; }
    .gap-row { display: flex; align-items: center; gap: 8px; }
  `;
}

export function getDashboardBody(): string {
  return `
    <!-- Auth Gate -->
    <div id="auth-gate" class="hidden">
      <div class="terminal-window">
        <div class="terminal-titlebar">
          <div class="traffic-lights">
            <span class="dot dot-red"></span>
            <span class="dot dot-yellow"></span>
            <span class="dot dot-green"></span>
          </div>
          <span class="titlebar-text">envpilot ~ auth</span>
        </div>
        <div class="terminal-body center-content">
          <div style="font-size: 32px; margin-bottom: 8px;">&#128274;</div>
          <div class="prompt-line"><span class="prompt">$</span> envpilot auth --login<span class="cursor"></span></div>
          <p>Sign in to securely manage and sync environment variables across your team.</p>
          <button class="btn btn-primary" onclick="send('signIn')">Sign In to Envpilot</button>
        </div>
      </div>
    </div>

    <!-- Dashboard -->
    <div id="dashboard" class="hidden">
      <!-- Header -->
      <div class="header">
        <div class="header-left">
          <span class="prompt">$</span>
          <span class="text-green">envpilot</span>
          <span class="text-dim">dashboard</span>
        </div>
        <div class="header-right">
          <span class="badge badge-green" id="user-badge"></span>
          <button class="btn btn-secondary btn-sm" onclick="send('refresh')">Refresh</button>
          <button class="btn btn-secondary btn-sm" onclick="send('signOut')">Sign Out</button>
        </div>
      </div>

      <!-- Stats -->
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-value" id="stat-projects">0</div>
          <div class="stat-label">Projects</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="stat-directories">0</div>
          <div class="stat-label">Directories</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="stat-variables">-</div>
          <div class="stat-label">Variables</div>
        </div>
      </div>

      <!-- Active Project -->
      <div id="active-project" class="hidden">
        <div class="terminal-window">
          <div class="terminal-titlebar">
            <div class="traffic-lights">
              <span class="dot dot-red"></span>
              <span class="dot dot-yellow"></span>
              <span class="dot dot-green"></span>
            </div>
            <span class="titlebar-text" id="project-title"></span>
            <div class="gap-row" id="project-badges"></div>
          </div>
          <div class="terminal-body">
            <div class="project-header">
              <div>
                <div class="project-name" id="project-name"></div>
                <div class="project-org" id="project-org"></div>
              </div>
              <div class="gap-row">
                <span id="sync-indicator"></span>
                <span class="text-dim" id="sync-text"></span>
              </div>
            </div>

            <div class="section-label">// linked directories</div>
            <div id="directories-list"></div>
          </div>
        </div>
      </div>

      <!-- No Project State -->
      <div id="no-project" class="hidden">
        <div class="terminal-window">
          <div class="terminal-titlebar">
            <div class="traffic-lights">
              <span class="dot dot-red"></span>
              <span class="dot dot-yellow"></span>
              <span class="dot dot-green"></span>
            </div>
            <span class="titlebar-text">envpilot ~ projects</span>
          </div>
          <div class="terminal-body center-content">
            <div class="prompt-line"><span class="prompt">$</span> envpilot link --project<span class="cursor"></span></div>
            <p>No project linked to this workspace. Link a project to start syncing environment variables.</p>
            <button class="btn btn-primary" onclick="send('linkProject')">Link Project</button>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="actions-bar">
        <button class="btn btn-primary" onclick="send('pullVariables')">Pull Variables</button>
        <button class="btn btn-secondary" onclick="send('linkProject')">Link Project</button>
        <button class="btn btn-secondary" onclick="send('openDashboard')">Open Web Dashboard</button>
      </div>
    </div>
  `;
}

export function getDashboardJs(): string {
  return `
    const vscode = acquireVsCodeApi();

    function send(type, data) {
      vscode.postMessage({ type, ...data });
    }

    function formatTime(timestamp) {
      if (!timestamp) return 'never';
      const diff = Date.now() - timestamp;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      if (minutes < 1) return 'just now';
      if (minutes < 60) return minutes + 'm ago';
      if (hours < 24) return hours + 'h ago';
      return new Date(timestamp).toLocaleDateString();
    }

    function syncClass(lastSyncedAt) {
      if (!lastSyncedAt) return 'sync-never';
      return (Date.now() - lastSyncedAt) < 3600000 ? 'sync-fresh' : 'sync-stale';
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function renderState(state) {
      const authGate = document.getElementById('auth-gate');
      const dashboard = document.getElementById('dashboard');

      if (!state.isAuthenticated) {
        authGate.classList.remove('hidden');
        dashboard.classList.add('hidden');
        return;
      }

      authGate.classList.add('hidden');
      dashboard.classList.remove('hidden');

      // User badge
      document.getElementById('user-badge').textContent = state.user?.email || 'Signed in';

      // Stats
      const projects = state.linkedProjects || [];
      const totalDirs = projects.reduce((sum, p) => sum + (p.directories?.length || 0), 0);
      document.getElementById('stat-projects').textContent = projects.length;
      document.getElementById('stat-directories').textContent = totalDirs;
      document.getElementById('stat-variables').textContent =
        state.variableCount != null ? state.variableCount : '-';

      // Active project
      const activeProject = state.activeProject;
      const activeSection = document.getElementById('active-project');
      const noProjectSection = document.getElementById('no-project');

      if (activeProject) {
        activeSection.classList.remove('hidden');
        noProjectSection.classList.add('hidden');

        document.getElementById('project-title').textContent =
          activeProject.projectName + ' ~ dashboard';
        document.getElementById('project-name').textContent = activeProject.projectName;
        document.getElementById('project-org').textContent = activeProject.organizationName;

        // Sync indicator
        const syncIndicator = document.getElementById('sync-indicator');
        const syncText = document.getElementById('sync-text');

        if (state.isSyncing) {
          syncIndicator.innerHTML = '<div class="sync-spinning"></div>';
          syncText.textContent = 'Syncing...';
        } else {
          const dirs = activeProject.directories || [];
          const latestSync = dirs.reduce((max, d) =>
            Math.max(max, d.lastSyncedAt || 0), 0);
          const sc = syncClass(latestSync || null);
          syncIndicator.innerHTML = '<span class="sync-dot ' + sc + '"></span>';
          syncText.textContent = latestSync ? 'Synced ' + formatTime(latestSync) : 'Never synced';
        }

        // Directories
        const dirList = document.getElementById('directories-list');
        const dirs = activeProject.directories || [];

        if (dirs.length === 0) {
          dirList.innerHTML = '<div class="text-dim" style="padding: 12px 0;">No directories linked</div>';
        } else {
          dirList.innerHTML = dirs.map(function(dir) {
            var sc = syncClass(dir.lastSyncedAt);
            var envs = (dir.environments || []).join(', ');
            var path = escapeHtml(dir.displayName || dir.directoryPath);
            return '<div class="dir-row">' +
              '<div class="dir-info">' +
                '<div class="dir-path">' + path + '</div>' +
                '<div class="dir-meta">' +
                  '<span class="sync-dot ' + sc + '"></span>' +
                  '<span>' + envs + ' &rarr; ' + escapeHtml(dir.targetFile) + '</span>' +
                  '<span>&middot;</span>' +
                  '<span>' + formatTime(dir.lastSyncedAt) + '</span>' +
                '</div>' +
              '</div>' +
              '<div class="dir-actions">' +
                '<button class="btn-icon" onclick="send(\\'pullVariables\\')" title="Sync">&#8635;</button>' +
                '<button class="btn-icon" onclick="send(\\'removeDirectory\\', {projectId:\\'' + escapeHtml(activeProject.projectId) + '\\', directoryPath:\\'' + escapeHtml(dir.directoryPath) + '\\'})">&#10005;</button>' +
              '</div>' +
            '</div>';
          }).join('');
        }
      } else {
        activeSection.classList.add('hidden');
        noProjectSection.classList.remove('hidden');
      }
    }

    window.addEventListener('message', function(event) {
      var msg = event.data;
      if (msg.type === 'stateUpdate') {
        renderState(msg.state);
      } else if (msg.type === 'syncStarted') {
        var indicator = document.getElementById('sync-indicator');
        var text = document.getElementById('sync-text');
        if (indicator) indicator.innerHTML = '<div class="sync-spinning"></div>';
        if (text) text.textContent = 'Syncing...';
      }
    });

    document.addEventListener('DOMContentLoaded', function() {
      send('ready');
    });

    // Also fire ready immediately in case DOMContentLoaded already fired
    send('ready');
  `;
}
