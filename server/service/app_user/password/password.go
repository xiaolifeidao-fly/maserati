package password

import (
	"crypto/md5"
	"encoding/hex"
	"strings"
)

func Encrypt(username, rawPassword string) string {
	sum := md5.Sum([]byte(strings.TrimSpace(username) + "_" + strings.TrimSpace(rawPassword)))
	return hex.EncodeToString(sum[:])
}
