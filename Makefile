NAME        = Gomoku
DOCKER_EXEC = docker compose exec -T gomoku-dev


.DEFAULT_GOAL := all
all: $(NAME)

$(NAME): up install wasm tsc copy-static
	@echo "Empaquetage de l'application (Electron Builder)..."
	@$(DOCKER_EXEC) npm run build
	@echo "Génération du launcher script..."
	@rm -f $(NAME)
	@echo '#!/bin/bash' > $(NAME)
	@echo 'DIR=$$(dirname "$$(readlink -f "$$0")")' >> $(NAME)
	@echo 'exec "$$DIR/dist/linux-unpacked/Gomoku" --no-sandbox "$$@"' >> $(NAME)
	@chmod +x $(NAME)
	@echo "\n\033[1;32m✅ Build terminé.\033[0m"
	@echo "\nExécutez \033[1;34m./$(NAME)\033[0m pour lancer l'application.\n"

debug: up install wasm-debug tsc copy-static
	@echo "Empaquetage de l'application (DEBUG MODE)..."
	@$(DOCKER_EXEC) npm run build
	@echo "Génération du launcher script..."
	@rm -f $(NAME)
	@echo '#!/bin/bash' > $(NAME)
	@echo 'DIR=$$(dirname "$$(readlink -f "$$0")")' >> $(NAME)
	@echo 'exec "$$DIR/dist/linux-unpacked/Gomoku" --no-sandbox "$$@"' >> $(NAME)
	@chmod +x $(NAME)
	@echo "\n\033[1;32m✅ Build DEBUG terminé.\033[0m"
	@echo "\n\033[1;33mLes logs IA s'afficheront dans la console DevTools (F12)\033[0m\n"
	@echo "\nExécutez \033[1;34m./$(NAME)\033[0m pour lancer l'application.\n"

re: fclean all

# --- Sous-Tâches ---

install:
	@$(DOCKER_EXEC) npm install

wasm:
	@echo "Compilation Wasm..."
	@$(DOCKER_EXEC) emcc ia_core/gomoku_ai.cpp ia_core/gomoku_rules.cpp ia_core/gomoku_bridge.cpp -o src/renderer/ia_core.js \
		-O3 \
		-s WASM=1 \
		-s MODULARIZE=1 \
		-s EXPORT_NAME="GomokuAI" \
		-s EXPORTED_FUNCTIONS='["_initAI", "_setBoard", "_makeMove", "_getBestMove", "_cleanupAI", "_get_board_buffer", "_rules_validateMove", "_rules_checkWinAt", "_rules_checkWin" , "_rules_checkCaptures", "_rules_checkStalemate", "_getAiCandidateMoves"]' \
		-s EXPORTED_RUNTIME_METHODS='["ccall", "cwrap", "intArrayFromString", "writeArrayToMemory"]' \
		-s ALLOW_MEMORY_GROWTH=1

wasm-debug:
	@echo "Compilation Wasm (DEBUG MODE)..."
	@$(DOCKER_EXEC) emcc ia_core/gomoku_ai.cpp ia_core/gomoku_rules.cpp ia_core/gomoku_bridge.cpp -o src/renderer/ia_core.js \
		-O3 \
		-D DEBUG_AI_LOGS \
		-s WASM=1 \
		-s MODULARIZE=1 \
		-s EXPORT_NAME="GomokuAI" \
		-s EXPORTED_FUNCTIONS='["_initAI", "_setBoard", "_makeMove", "_getBestMove", "_cleanupAI", "_get_board_buffer", "_rules_validateMove", "_rules_checkWinAt", "_rules_checkWin" , "_rules_checkCaptures", "_rules_checkStalemate", "_getAiCandidateMoves"]' \
		-s EXPORTED_RUNTIME_METHODS='["ccall", "cwrap", "intArrayFromString", "writeArrayToMemory"]' \
		-s ALLOW_MEMORY_GROWTH=1

tsc:
	@echo "Compilation TypeScript..."
	@$(DOCKER_EXEC) npx tsc --project tsconfig.json
	@$(DOCKER_EXEC) npx tsc --project tsconfig.worker.json
	@$(DOCKER_EXEC) npm run build:renderer

copy-static:
	@$(DOCKER_EXEC) npm run copy-static

# --- Commandes Docker & Nettoyage ---

up:
	@docker compose up -d --build

down:
	@docker compose down

clean:
	@$(DOCKER_EXEC) rm -rf dist .electron

fclean: clean
	@$(DOCKER_EXEC) rm -rf node_modules src/renderer/ia_core.wasm src/renderer/ia_core.js 2>/dev/null || true
	@docker compose down -v
	@rm -f $(NAME)


.PHONY: all $(NAME) $(NAME)-debug re lint install wasm wasm-debug tsc copy-static up down shell clean fclean prune