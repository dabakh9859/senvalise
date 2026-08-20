package main

import (
	"log"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"senvalise/internal/api"
	"senvalise/internal/database"
)

func main() {
	checkSecret()
	db, err := database.Open()
	if err != nil {
		log.Fatal(err)
	}
	app := fiber.New(fiber.Config{AppName: "SenValise", ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, ErrorHandler: func(c *fiber.Ctx, e error) error {
		code := 500
		if x, ok := e.(*fiber.Error); ok {
			code = x.Code
		}
		return c.Status(code).JSON(fiber.Map{"error": e.Error()})
	}})
	app.Use(recover.New(), logger.New(), cors.New(cors.Config{AllowOrigins: origin(), AllowHeaders: "Origin, Content-Type, Accept, Authorization", ExposeHeaders: "X-Total-Count", AllowMethods: "GET,POST,PUT,PATCH,DELETE,OPTIONS"}))
	app.Static("/uploads", "./uploads")
	(&api.Server{DB: db}).Register(app)
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Fatal(app.Listen(":" + port))
}
// checkSecret refuse de demarrer en production avec le secret de developpement.
//
// JWT_SECRET retombait silencieusement sur une valeur connue quand la variable
// manquait : n'importe qui pouvait alors forger un jeton de gerant. En
// developpement l'avertissement suffit, mais une mise en ligne sans secret
// doit s'arreter net.
func checkSecret() {
	secret := os.Getenv("JWT_SECRET")
	weak := secret == "" || secret == "change-me-in-production" || secret == "local-development-secret-change-this"
	if !weak {
		return
	}
	if os.Getenv("APP_ENV") == "production" {
		log.Fatal("JWT_SECRET absent ou laisse a sa valeur par defaut : demarrage refuse en production.")
	}
	log.Println("ATTENTION : JWT_SECRET absent ou par defaut. A ne jamais laisser ainsi hors developpement.")
}

func origin() string {
	o := os.Getenv("APP_ORIGIN")
	if o == "" {
		return "http://localhost:3000,http://127.0.0.1:3000"
	}
	return strings.TrimSpace(o)
}
