#!/usr/bin/env fish

# =========================================
#   Envpilot — Build & Test CLI
# =========================================

set -l RED    (set_color red)
set -l GREEN  (set_color green)
set -l YELLOW (set_color yellow)
set -l CYAN   (set_color cyan)
set -l BOLD   (set_color --bold)
set -l DIM    (set_color brblack)
set -l RESET  (set_color normal)

set -l CLI ./apps/cli/dist/index.js

cd /Users/prometheus/Code/ENV_Connect

echo ""
echo "$BOLD$CYAN=========================================$RESET"
echo "$BOLD$CYAN  Envpilot — Build & Test CLI$RESET"
echo "$BOLD$CYAN=========================================$RESET"
echo ""

# --- Build ---
echo "$BOLD$YELLOW▸ Building CLI...$RESET"
echo ""
if not bun run build:cli
    echo ""
    echo "$RED  ✗ Build failed. Fix errors above and retry.$RESET"
    echo ""
    exit 1
end

echo ""
echo "$GREEN  ✓ CLI built successfully!$RESET"
echo ""

# --- Interactive command picker ---
while true
    echo "$BOLD$CYAN─────────────────────────────────────────$RESET"
    echo "$BOLD  Pick a command to run:$RESET"
    echo ""
    echo "   1) login          9) config"
    echo "   2) logout        10) switch"
    echo "   3) whoami        11) usage"
    echo "   4) init          12) man"
    echo "   5) pull          13) ui"
    echo "   6) push          14) unlink"
    echo "   7) sync"
    echo "   8) list / ls"
    echo ""
    echo "   c) custom command  $DIM(e.g. \"pull --help\")$RESET"
    echo "   r) rebuild CLI"
    echo "   q) quit"
    echo "$BOLD$CYAN─────────────────────────────────────────$RESET"
    echo ""

    read -P "$BOLD  ▸ Choice: $RESET" choice

    switch $choice
        case 1
            set cmd login
        case 2
            set cmd logout
        case 3
            set cmd whoami
        case 4
            set cmd init
        case 5
            set cmd pull
        case 6
            set cmd push
        case 7
            set cmd sync
        case 8
            set cmd list
        case 9
            set cmd config
        case 10
            set cmd switch
        case 11
            set cmd usage
        case 12
            set cmd man
        case 13
            set cmd ui
        case 14
            set cmd unlink
        case c
            read -P "$BOLD  ▸ Enter full args: $DIM""envpilot ""$RESET" custom_args
            echo ""
            echo "$YELLOW  → node $CLI $custom_args$RESET"
            echo ""
            node $CLI (string split " " $custom_args)
            echo ""
            continue
        case r
            echo ""
            echo "$BOLD$YELLOW▸ Rebuilding CLI...$RESET"
            echo ""
            if bun run build:cli
                echo ""
                echo "$GREEN  ✓ Rebuilt!$RESET"
            else
                echo ""
                echo "$RED  ✗ Build failed.$RESET"
            end
            echo ""
            continue
        case q
            echo ""
            echo "$GREEN  Bye! 👋$RESET"
            echo ""
            exit 0
        case '*'
            echo ""
            echo "$RED  Invalid choice, try again.$RESET"
            echo ""
            continue
    end

    # Ask for extra flags/args
    read -P "$BOLD  ▸ Extra args for '$cmd'? $DIM""(enter to skip) ""$RESET" extra_args

    echo ""
    if test -n "$extra_args"
        echo "$YELLOW  → node $CLI $cmd $extra_args$RESET"
        echo ""
        node $CLI $cmd (string split " " $extra_args)
    else
        echo "$YELLOW  → node $CLI $cmd$RESET"
        echo ""
        node $CLI $cmd
    end
    echo ""
end
