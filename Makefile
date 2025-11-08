# Variables
NAME = Gomoku
DOCKER_EXEC = docker compose exec -T gomoku-dev

# Phony targets
.PHONY: all install start build wasm clean fclean re

# Main rules
all: build

# Development rules
start: build
	@echo "\n\033[1;32m✅ Build finished successfully!\033[0m"
	@echo "\n\033[1;33mTo run the application, execute this command in a NEW LOCAL terminal (not the Docker one):\033[0m"
	@echo "\033[1;36m./dist/linux-unpacked/Gomoku\033[0m\n"

install:
	@echo "Installing Node.js dependencies..."
	$(DOCKER_EXEC) npm install

tsc:
	@echo "Compiling TypeScript..."
	$(DOCKER_EXEC) npx tsc

wasm:
	@echo "Compiling C++ core to WebAssembly..."
	$(DOCKER_EXEC) emcc ia_core/main.cpp -o src/renderer/ia_core.wasm -O3 -s WASM=1 -s SIDE_MODULE=1

build: install wasm tsc
	@echo "Packaging application for production..."
	$(DOCKER_EXEC) npm run build

# Cleaning rules
clean:
	@echo "Cleaning build artifacts..."
	rm -rf dist .electron

fclean: clean
	@echo "Cleaning all generated files..."
	rm -rf node_modules
	rm -f src/renderer/ia_core.wasm
	rm -rf dist

re: fclean all

# Utility rules
docker-up:
	@echo "Starting Docker container..."
	docker compose up -d --build

docker-down:
	@echo "Stopping Docker container..."
	docker compose down

docker-shell:
	@echo "Opening a shell in the container..."
	docker compose exec gomoku-dev /bin/bash
