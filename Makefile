.PHONY: dev down logs test build
dev:
	docker compose up -d --build
down:
	docker compose down
logs:
	docker compose logs -f
test:
	go test ./...
	npm run build
build:
	docker compose build
