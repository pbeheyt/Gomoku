# ==============================================================================
#                                 GOMOKU MAKEFILE
# ==============================================================================

# --- Variables ---
NAME        = Gomoku
# -T : Désactive l'allocation de pseudo-TTY pour éviter les erreurs de logs dans les pipes CI/CD
DOCKER_EXEC = docker compose exec -T gomoku-dev

# --- Commandes Principales ----

.DEFAULT_GOAL := all
all: build

# Pipeline séquentiel :
# 1. up         : Démarrage infra
# 2. install    : Dépendances Node
# 3. wasm       : Compilation C++ -> JS/Wasm
# 4. tsc        : Transpilation TypeScript -> JS
# 5. copy-static: Assets
build: up install wasm tsc copy-static
	@echo "Empaquetage de l'application (Electron Builder)..."
	@$(DOCKER_EXEC) npm run build
	@echo "Création du lien symbolique..."
	@ln -sf dist/linux-unpacked/Gomoku $(NAME)
	@echo "\n\033[1;32m✅ Build terminé.\033[0m"
	@echo "\nExécutez \033[1;34m./$(NAME)\033[0m pour lancer l'application.\n"

# Build en mode DEBUG avec logs IA activés
build-debug: up install wasm-debug tsc copy-static
	@echo "Empaquetage de l'application (DEBUG MODE)..."
	@$(DOCKER_EXEC) npm run build
	@echo "Création du lien symbolique..."
	@ln -sf dist/linux-unpacked/Gomoku $(NAME)
	@echo "\n\033[1;32m✅ Build DEBUG terminé.\033[0m"
	@echo "\n\033[1;33mLes logs IA s'afficheront dans la console DevTools (F12)\033[0m\n"
	@echo "\nExécutez \033[1;34m./$(NAME)\033[0m pour lancer l'application.\n"

re: fclean all

# --- Sous-Tâches (Étapes de build) ---

lint:
	@$(DOCKER_EXEC) npm run lint

install:
	@$(DOCKER_EXEC) npm install

# Compilation du cœur C++ vers WebAssembly via Emscripten (emcc)
# DOCUMENTATION DES FLAGS CRITIQUES :
# -O3                       : Optimisation maximale (Level 3). Vital pour la perf de l'IA (Minimax).
# -s WASM=1                 : Force la sortie en binaire .wasm (et non asm.js).
# -s MODULARIZE=1           : Encapsule le code généré dans une Factory Function pour éviter de polluer le scope global.
# -s EXPORT_NAME="GomokuAI" : Nom de la Factory Function à importer en JS.
# -s EXPORTED_FUNCTIONS     : Liste blanche des symboles C++ à conserver (empêche le "Dead Code Elimination").
#                             Inclut _malloc/_free pour la gestion manuelle de la mémoire depuis JS.
# -s EXPORTED_RUNTIME_METHODS : Fonctions helpers JS générées par Emscripten (ex: writeArrayToMemory pour passer le board).
# -s ALLOW_MEMORY_GROWTH=1  : Permet au Heap Wasm de s'agrandir dynamiquement si l'IA alloue trop de RAM.
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

# Compilation Wasm en mode Debug avec logs détaillés de l'IA
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

# Compilation TypeScript multi-cibles
tsc:
	@echo "Compilation TypeScript..."
# 1. Main Process (Node.js context)
	@$(DOCKER_EXEC) npx tsc --project tsconfig.json
# 2. Worker Process (WebWorker context - pas de DOM, pas de Node)
	@$(DOCKER_EXEC) npx tsc --project tsconfig.worker.json
# 3. Renderer Process (Browser context) - Bundlé via Esbuild pour la perf
	@$(DOCKER_EXEC) npm run build:renderer

copy-static:
	@$(DOCKER_EXEC) npm run copy-static

# --- Commandes Docker & Nettoyage ---

# --build : Force la reconstruction de l'image si le Dockerfile a changé
up:
	@docker compose up -d --build

down:
	@docker compose down

shell:
	@docker compose exec gomoku-dev /bin/bash

clean:
	@$(DOCKER_EXEC) rm -rf dist .electron

fclean: clean
	@$(DOCKER_EXEC) rm -rf node_modules
	@$(DOCKER_EXEC) rm -f src/renderer/ia_core.wasm src/renderer/ia_core.js
	@rm -f $(NAME)

# Nettoyage système pour libérer de l'espace disque (Images dangling, cache build)
prune: down
	@docker system prune -a --volumes

.PHONY: all build re lint install wasm tsc copy-static up down shell clean fclean prune