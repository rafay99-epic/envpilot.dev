package main

import "strings"

// buildDotenv serializes variables to dotenv text.
//
// Every value is single-quoted with embedded quotes escaped, so a value
// containing spaces, '#', '$' or a newline round-trips through
// `set -a; . file` and through Compose's env_file without the shell
// re-interpreting it. Unquoted output is the usual source of "my JSON
// credential arrived truncated at the first space".
func buildDotenv(vars []Variable) string {
	if len(vars) == 0 {
		return ""
	}
	var b strings.Builder
	for _, v := range vars {
		value := ""
		if v.Value != nil {
			value = *v.Value
		}
		b.WriteString(v.Key)
		b.WriteString("='")
		b.WriteString(strings.ReplaceAll(value, "'", `'\''`))
		b.WriteString("'\n")
	}
	return b.String()
}
