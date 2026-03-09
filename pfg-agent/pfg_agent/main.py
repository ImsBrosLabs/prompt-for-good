"""pfg-agent entry point."""

import structlog

from pfg_agent.pipeline import AgentPipeline

log = structlog.get_logger()


def main() -> None:
    """Run the pfg-agent pipeline."""
    log.info("pfg-agent starting")
    pipeline = AgentPipeline()
    pipeline.run()


if __name__ == "__main__":
    main()
