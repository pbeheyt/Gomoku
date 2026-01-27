FROM node:20-bullseye-slim

WORKDIR /app

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
    # 5. Nettoyer les fichiers d'installation inutiles pour réduire la taille de l'image finale
    cd / && \
    rm /emsdk.tar.gz && \
    rm -rf /emsdk/zips && \
    rm -rf /emsdk/.git

ENV PATH="/emsdk:/emsdk/upstream/emscripten:${PATH}"

WORKDIR /app

CMD ["tail", "-f", "/dev/null"]