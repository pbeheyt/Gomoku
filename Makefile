# --- Variables ---
NAME        = Gomoku
DOCKER_EXEC = docker compose exec -T gomoku-dev

# --- Main Commands ----

.DEFAULT_GOAL := all
all: build

build: up install wasm tsc copy-static
	@echo "Packaging application for production..."
	@$(DOCKER_EXEC) npm run build
	@echo "\n\033[1;32mBuild finished successfully!\033[0m"
	@echo "\n\033[1;33mTo run the application, execute this command in a NEW LOCAL terminal:\033[0m"
	@echo "\033[1;36m   ./dist/linux-unpacked/gomoku\033[0m\n"

re: fclean all

# --- Sub-Tasks  ---

# Install/check Node.js dependencies inside the container.
install:
	@echo "Installing/checking Node.js dependencies..."
	@$(DOCKER_EXEC) npm install

# Compile C++ core to WebAssembly.
wasm:
	@echo "Compiling C++ core to WebAssembly..."
	@$(DOCKER_EXEC) emcc ia_core/gomoku_ai.cpp -o src/renderer/ia_core.js -O3 -s WASM=1 -s MODULARIZE=1 -s EXPORT_NAME="GomokuAI" -s EXPORTED_FUNCTIONS='["_initAI", "_setBoard", "_makeMove", "_getBestMove", "_cleanupAI", "_malloc", "_free"]' -s EXPORTED_RUNTIME_METHODS='["ccall", "cwrap", "intArrayFromString", "writeArrayToMemory"]' -s ALLOW_MEMORY_GROWTH=1

# Compile all TypeScript projects.
tsc:
	@echo "Compiling TypeScript (Type Check)..."
	@$(DOCKER_EXEC) npx tsc --project tsconfig.json
	@$(DOCKER_EXEC) npx tsc --project tsconfig.preload.json
	@$(DOCKER_EXEC) npx tsc --project tsconfig.worker.json
	@echo "Bundling Renderer with Esbuild..."
	@$(DOCKER_EXEC) npm run build:renderer

# Copy static files to the distribution folder.
copy-static:
	@echo "Copying static files (HTML, CSS, WASM)..."
	@$(DOCKER_EXEC) npm run copy-static

# --- Docker & Cleaning Commands ---

# Ensure the Docker container is up and running.
up:
	@echo "Ensuring Docker container is running..."
	@docker compose up -d --build

# Stop the Docker container.
down:
	@echo "Stopping Docker container..."
	@docker compose down

# Open an interactive shell inside the container for debugging.
shell:
	@echo "Opening a shell in the container..."
	@docker compose exec gomoku-dev /bin/bash

# Clean build artifacts.
clean:
	@echo "Cleaning build artifacts..."
	@$(DOCKER_EXEC) rm -rf dist .electron

# Clean all generated files, including dependencies.
fclean: clean
	@echo "Cleaning all generated files..."
	@$(DOCKER_EXEC) rm -rf node_modules
	@$(DOCKER_EXEC) rm -f src/renderer/ia_core.wasm src/renderer/ia_core.js

# Prune unused Docker data.
prune: down
	@echo "\033[1;33mWARNING: This will remove all unused Docker data (containers, images, build cache).\033[0m"
	@docker system prune -a --volumes

# Declare targets that are not files.
.PHONY: all build re install wasm tsc copy-static up down shell clean fclean