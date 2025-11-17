# ============================================================================== #
#                    Dockerfile Final - Optimisation Maximale                    #
# ============================================================================== #

# Utiliser l'image de base la plus légère possible
FROM node:20-bullseye-slim

# Définir le répertoire de travail
WORKDIR /app

# Installer les dépendances système et nettoyer dans la même couche pour minimiser la taille
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    python3 \
    cmake \
    build-essential \
    # Dépendances Electron
    libgtk-3-0 \
    libnss3 \
    libasound2 \
    libxtst6 \
    libxss1 \
    libatk-bridge2.0-0 \
    libgbm-dev \
    # Outils pour télécharger l'archive et certificats
    wget \
    tar \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# --- OPTIMISATION EMSCRIPTEN EN UNE SEULE COUCHE ---
# On fait TOUT dans une seule et même commande RUN pour minimiser les couches Docker
# et on nettoie les fichiers d'installation dont on n'a plus besoin à la fin.
ENV EMSDK_VERSION=3.1.59
RUN \
    # 1. Télécharger l'archive
    wget https://github.com/emscripten-core/emsdk/archive/refs/tags/${EMSDK_VERSION}.tar.gz -O /emsdk.tar.gz && \
    \
    # 2. Extraire l'archive
    tar -xzf /emsdk.tar.gz -C / && \
    \
    # 3. Renommer le dossier
    mv /emsdk-${EMSDK_VERSION} /emsdk && \
    \
    # 4. Lancer l'installation d'emsdk
    cd /emsdk && \
    ./emsdk install ${EMSDK_VERSION} && \
    ./emsdk activate ${EMSDK_VERSION} && \
    \
    # 5. NETTOYER les fichiers d'installation inutiles (CRUCIAL)
    # On remonte à la racine pour être sûr des chemins
    cd / && \
    rm /emsdk.tar.gz && \
    # On supprime les zips téléchargés par emsdk lui-même
    rm -rf /emsdk/zips && \
    # On supprime les caches de git
    rm -rf /emsdk/.git

# Ajouter les outils Emscripten au PATH pour les futures commandes
ENV PATH="/emsdk:/emsdk/upstream/emscripten:${PATH}"

# Revenir au répertoire de l'application
WORKDIR /app

# Garder le conteneur en vie
CMD ["tail", "-f", "/dev/null"]