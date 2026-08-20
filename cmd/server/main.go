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
	app.Use(recover.New(), logger.New(), cors.New(cors.Config{AllowOrigins: origin(), AllowHeaders: "Origin, Content-Type, Accept, Authorization", AllowMethods: "GET,POST,PUT,PATCH,DELETE,OPTIONS"}))
	app.Static("/uploads", "./uploads")
	(&api.Server{DB: db}).Register(app)
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Fatal(app.Listen(":" + port))
}
func origin() string {
	o := os.Getenv("APP_ORIGIN")
	if o == "" {
		return "http://localhost:3000,http://127.0.0.1:3000"
	}
	return strings.TrimSpace(o)
}
