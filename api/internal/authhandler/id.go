package authhandler

import (
	"crypto/rand"
	"encoding/hex"
)

func newID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}
