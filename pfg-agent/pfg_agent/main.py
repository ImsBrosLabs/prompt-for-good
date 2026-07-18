"""pfg-agent entry point."""

import structlog

from pfg_agent.config import settings
from pfg_agent.hub_client import TRANSIENT_HUB_ERRORS
from pfg_agent.pipeline import AgentPipeline

log = structlog.get_logger()


def main() -> None:
    """Run the pfg-agent pipeline."""
    log.info("pfg-agent starting")
    pipeline = AgentPipeline()
    try:
        pipeline.run()
    except TRANSIENT_HUB_ERRORS as exc:
        log.error("unable to reach pfg-hub", hub_url=settings.pfg_hub_url, error=str(exc))
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
