# Use a more recent Node.js version for dependency compatibility
FROM node:20-bullseye

# Set working directory
WORKDIR /app

# Install basic build tools and all required dependencies for Electron
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    python3 \
    cmake \
    build-essential \
    # Electron dependencies
    libgtk-3-0 \
    libnss3 \
    libasound2 \
    libxtst6 \
    libxss1 \
    libatk-bridge2.0-0 \
    libgbm-dev \
    && apt-get clean

# Install Emscripten SDK (for C++ -> WASM compilation)
RUN git clone https://github.com/emscripten-core/emsdk.git /emsdk
WORKDIR /emsdk
RUN ./emsdk install latest
RUN ./emsdk activate latest

# Set Emscripten environment variables for all subsequent commands
ENV PATH="/emsdk:/emsdk/node/16.20.0_64bit/bin:/emsdk/upstream/emscripten:${PATH}"

# Switch back to the app directory
WORKDIR /app

# Keep the container running
CMD ["tail", "-f", "/dev/null"]
