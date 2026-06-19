package dashboard

import (
	"crypto/rand"
	"fmt"
)

const dashIDAlphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
const dashIDLength = 8

func newDashID(prefix string) string {
	bytes := make([]byte, dashIDLength)
	if _, err := rand.Read(bytes); err != nil {
		panic(fmt.Sprintf("dashboard: generate %s id: %v", prefix, err))
	}

	id := make([]byte, dashIDLength)
	for i, value := range bytes {
		id[i] = dashIDAlphabet[int(value)%len(dashIDAlphabet)]
	}
	return prefix + "_" + string(id)
}
