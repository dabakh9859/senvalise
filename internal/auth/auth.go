package auth

import (
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"os"
	"strings"
	"time"
)

type Claims struct {
	UserID uint   `json:"uid"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

func secret() []byte {
	s := os.Getenv("JWT_SECRET")
	if s == "" {
		s = "dev-secret-change-me"
	}
	return []byte(s)
}
func Sign(id uint, role string) (string, error) {
	return jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{UserID: id, Role: role, RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour))}}).SignedString(secret())
}
func Required(c *fiber.Ctx) error {
	h := c.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return fiber.ErrUnauthorized
	}
	claims := &Claims{}
	t, e := jwt.ParseWithClaims(strings.TrimPrefix(h, "Bearer "), claims, func(t *jwt.Token) (any, error) { return secret(), nil })
	if e != nil || !t.Valid {
		return fiber.ErrUnauthorized
	}
	c.Locals("userID", claims.UserID)
	c.Locals("role", claims.Role)
	return c.Next()
}
func Manager(c *fiber.Ctx) error {
	if c.Locals("role") != "manager" {
		return fiber.ErrForbidden
	}
	return c.Next()
}
