# SerendipiTV Makefile

.PHONY: help install dev start stop restart status

help:
	@echo "SerendipiTV - Available Commands:"
	@echo ""
	@echo "  install     - Install dependencies"
	@echo "  dev         - Start development server with nodemon"
	@echo "  start       - Start the app"
	@echo "  stop        - Stop the running server"
	@echo "  restart     - Restart the server"
	@echo "  status      - Show whether the server is running"
	@echo ""

install:
	@echo "Installing dependencies..."
	npm install

dev:
	@echo "Starting development server..."
	npm run dev

start:
	@echo "Starting SerendipiTV..."
	npm start

stop:
	@echo "Stopping SerendipiTV..."
	pkill -f "node server.js" || echo "No server running"

restart: stop start

status:
	@echo "SerendipiTV status:"
	@if pgrep -f "node server.js" > /dev/null; then \
		echo "Running on http://localhost:3000"; \
	else \
		echo "Not running"; \
	fi
