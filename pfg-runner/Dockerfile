FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    # Java build tools (for repos that use Maven/Gradle)
    default-jdk-headless \
    maven \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN pip install --no-cache-dir uv

WORKDIR /app

# Copy agent source
COPY ../pfg-agent/pyproject.toml ../pfg-agent/uv.lock* ./
RUN uv sync --no-dev

COPY ../pfg-agent/pfg_agent ./pfg_agent

# Configure git identity for commits
RUN git config --global user.name "pfg-agent" && \
    git config --global user.email "agent@promptforgood.dev"

# Entrypoint
CMD ["uv", "run", "pfg-agent"]
