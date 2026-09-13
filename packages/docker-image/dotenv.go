package main

import "strings"

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
