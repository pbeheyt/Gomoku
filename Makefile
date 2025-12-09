# ==============================================================================
#                                 GOMOKU MAKEFILE
# ==============================================================================

# --- Variables ---
NAME        = Gomoku
DOCKER_EXEC = docker compose exec -T gomoku-dev

# --- Commandes Principales ----

.DEFAULT_GOAL := all
all: build

# Pipeline de construction complet
build: up install wasm tsc copy-static
	@echo "Empaquetage de l'application pour la production..."
	@$(DOCKER_EXEC) npm run build
	@echo "Création du lien symbolique pour $(NAME)..."
	@ln -sf dist/linux-unpacked/Gomoku $(NAME)
	@echo "\n\033[1;32m✅ Build terminé avec succès !\033[0m"
	@echo "\n\033[1;33mPour lancer l'application, exécutez cette commande dans un NOUVEAU terminal LOCAL :\033[0m"
	@echo "\033[1;36m   ./$(NAME)\033[0m\n"

# Reconstruit tout depuis zéro
re: fclean all

# --- Sous-Tâches (Étapes de build) ---

# Lance le Linter (ESLint)
lint:
	@echo "Lancement du Linter (ESLint)..."
	@$(DOCKER_EXEC) npm run lint

# Installe ou vérifie les dépendances Node.js dans le conteneur
install:
	@echo "Installation/Vérification des dépendances Node.js..."
	@$(DOCKER_EXEC) npm install

# Compile le cœur C++ en WebAssembly (Wasm)
# Flags : -O3 (Optimisation max), Modularize (Encapsulation JS), Allow Memory Growth
wasm:
	@echo "Compilation du cœur C++ vers WebAssembly..."
	@$(DOCKER_EXEC) emcc ia_core/gomoku_ai.cpp -o src/renderer/ia_core.js \
		-O3 \
		-s WASM=1 \
		-s MODULARIZE=1 \
		-s EXPORT_NAME="GomokuAI" \
		-s EXPORTED_FUNCTIONS='["_initAI", "_setBoard", "_makeMove", "_getBestMove", "_cleanupAI", "_malloc", "_free"]' \
		-s EXPORTED_RUNTIME_METHODS='["ccall", "cwrap", "intArrayFromString", "writeArrayToMemory"]' \
		-s ALLOW_MEMORY_GROWTH=1

# Compile les projets TypeScript
tsc:
	@echo "Compilation TypeScript (Vérification des types)..."
	@$(DOCKER_EXEC) npx tsc --project tsconfig.json
	@$(DOCKER_EXEC) npx tsc --project tsconfig.worker.json
	@echo "Bundling du Renderer avec Esbuild..."
	@$(DOCKER_EXEC) npm run build:renderer

# Copie les assets statiques vers le dossier de distribution
copy-static:
	@echo "Copie des fichiers statiques (HTML, CSS, WASM, Sons)..."
	@$(DOCKER_EXEC) npm run copy-static

# --- Commandes Docker & Nettoyage ---

# Démarre l'environnement Docker
up:
	@echo "Vérification du conteneur Docker..."
	@docker compose up -d --build

# Arrête l'environnement
down:
	@echo "Arrêt du conteneur Docker..."
	@docker compose down

# Ouvre un shell interactif dans le conteneur (Debug)
shell:
	@echo "Ouverture d'un shell dans le conteneur..."
	@docker compose exec gomoku-dev /bin/bash

# Nettoie les artefacts de build (dist)
clean:
	@echo "Nettoyage des artefacts de build..."
	@$(DOCKER_EXEC) rm -rf dist .electron

# Nettoyage profond (node_modules + wasm + binaire)
fclean: clean
	@echo "🔥 Nettoyage complet (fichiers générés et dépendances)..."
	@$(DOCKER_EXEC) rm -rf node_modules
	@$(DOCKER_EXEC) rm -f src/renderer/ia_core.wasm src/renderer/ia_core.js
	@rm -f $(NAME)

# Nettoyage système Docker (Attention)
prune: down
	@echo "\033[1;33m ATTENTION : Ceci supprimera toutes les données Docker inutilisées (conteneurs, images, cache).\033[0m"
	@docker system prune -a --volumes

# Cibles qui ne sont pas des fichiers
.PHONY: all build re lint install wasm tsc copy-static up down shell clean fclean prune