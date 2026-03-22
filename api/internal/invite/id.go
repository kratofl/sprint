package invite

import (
	"crypto/rand"
	"encoding/hex"
)

func newCode() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}
