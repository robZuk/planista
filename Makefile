# Skroty do obslugi projektu w kontenerach. Uzycie: make <cel>
# `make` bez argumentu wypisze liste celow.
.DEFAULT_GOAL := help
.PHONY: help dev dev-build down prod prod-down logs ps

help: ## Pokaz dostepne cele
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

## --- DEV (hot-reload, http://localhost:5174) ---
dev: ## Start dev w tle
	docker compose up -d

dev-build: ## Przebuduj obrazy i start dev
	docker compose up -d --build

down: ## Zatrzymaj dev (dane w bazie zostaja)
	docker compose down

## --- PROD (nginx, http://localhost:8080) ---
prod: ## Przebuduj i start prod
	docker compose -f docker-compose.prod.yml up -d --build

prod-down: ## Zatrzymaj prod
	docker compose -f docker-compose.prod.yml down

## --- Narzedzia ---
logs: ## Logi na zywo (Ctrl+C wychodzi)
	docker compose logs -f

ps: ## Status kontenerow
	docker compose ps
