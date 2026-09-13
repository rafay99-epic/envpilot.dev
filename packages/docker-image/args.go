package main

import "strings"

type Args struct {
	Command   string
	Project   string
	Env       string
	APIURL    string
	Out       string
	Dir       string
	WithFiles bool
	Quiet     bool
	Rest      []string
	Help      bool
	Version   bool
}

var commands = []string{"pull", "files", "exec"}

const usage = `envpilot — pull Envpilot variables and secret files into a Docker build or container

Usage:
  envpilot pull  [flags]              Write variables as dotenv (stdout by default)
  envpilot files [flags]              Write secret files to their recorded paths
  envpilot exec  [flags] -- <cmd>     Inject variables and run <cmd>

Flags:
  -p, --project <slug>   Project slug           (or ENVPILOT_PROJECT)
  -e, --env <name>       Environment            (or ENVPILOT_ENVIRONMENT)
  -o, --out <path>       pull: write here at 0600 instead of stdout
  -d, --dir <path>       files: output directory (default: current directory)
      --files            exec: also write secret files before running
      --api-url <url>    API base URL           (or ENVPILOT_API_URL)
  -q, --quiet            Suppress the progress line on stderr
  -h, --help             Show this help
  -v, --version          Show the version

Credentials:
  ENVPILOT_TOKEN_FILE    Path to a mounted secret holding the API key (preferred)
  ENVPILOT_TOKEN         The API key inline

There is no --token flag on purpose: a credential on a command line is
visible in ps, in shell history, and in build logs.`

func parseArgs(argv []string) (*Args, error) {
	parsed := &Args{}

	for _, a := range argv {
		if a == "--" {
			break
		}
		if a == "-h" || a == "--help" {
			parsed.Help = true
			return parsed, nil
		}
		if a == "-v" || a == "--version" {
			parsed.Version = true
			return parsed, nil
		}
	}

	if len(argv) == 0 {
		return nil, configErrorf("No command given. Expected one of: %s.", strings.Join(commands, ", "))
	}

	command := argv[0]
	known := false
	for _, c := range commands {
		if c == command {
			known = true
			break
		}
	}
	if !known {
		return nil, configErrorf("Unknown command %q. Expected one of: %s.", command, strings.Join(commands, ", "))
	}
	parsed.Command = command

	rest := argv[1:]
	valueFlags := map[string]*string{
		"--project": &parsed.Project, "-p": &parsed.Project,
		"--env": &parsed.Env, "-e": &parsed.Env,
		"--api-url": &parsed.APIURL,
		"--out":     &parsed.Out, "-o": &parsed.Out,
		"--dir": &parsed.Dir, "-d": &parsed.Dir,
	}

	for i := 0; i < len(rest); i++ {
		arg := rest[i]

		if arg == "--" {
			parsed.Rest = rest[i+1:]
			break
		}
		if arg == "--files" {
			parsed.WithFiles = true
			continue
		}
		if arg == "--quiet" || arg == "-q" {
			parsed.Quiet = true
			continue
		}
		if target, ok := valueFlags[arg]; ok {
			if i+1 >= len(rest) || strings.HasPrefix(rest[i+1], "-") {
				return nil, configErrorf("%s needs a value.", arg)
			}
			*target = rest[i+1]
			i++
			continue
		}
		return nil, configErrorf("Unknown flag %q. Run envpilot --help.", arg)
	}

	if parsed.Command == "exec" && len(parsed.Rest) == 0 {
		return nil, configErrorf("exec needs a command: envpilot exec --project api --env production -- ./server")
	}

	return parsed, nil
}
