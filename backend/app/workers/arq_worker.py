"""
AEGIS ARQ Worker Entry Point
Defines WorkerSettings that ARQ uses to configure the worker process.
All task functions registered here with their retry policies.

Start command: python -m arq app.workers.arq_worker.WorkerSettings
"""
import logging
from typing import Any

from arq import func
from arq.connections import RedisSettings

from app.config import REDIS_QUEUE_URL
from app.tasks.vision_task import process_vision_task
from app.tasks.audit_task import write_audit_log
from app.tasks.feedback_task import run_feedback_diagnosis
from app.tasks.cache_task import write_semantic_cache
from app.tasks.knowledge_gap_task import record_knowledge_gap
from app.tasks.ticket_task import create_mock_ticket
from app.tasks.cleanup_task import nightly_cleanup

logger = logging.getLogger(__name__)

# Task aliases — ARQ registers functions by their __name__, these wrappers
# ensure tasks can be dispatched with canonical names (e.g. 'audit_task')
async def vision_task(ctx, *args, **kwargs):
    return await process_vision_task(ctx, *args, **kwargs)

async def audit_task(ctx, *args, **kwargs):
    return await write_audit_log(ctx, *args, **kwargs)

async def feedback_task(ctx, *args, **kwargs):
    return await run_feedback_diagnosis(ctx, *args, **kwargs)

async def cache_task(ctx, *args, **kwargs):
    return await write_semantic_cache(ctx, *args, **kwargs)

async def knowledge_gap_task(ctx, *args, **kwargs):
    return await record_knowledge_gap(ctx, *args, **kwargs)

async def ticket_task(ctx, *args, **kwargs):
    return await create_mock_ticket(ctx, *args, **kwargs)

async def cleanup_task(ctx, *args, **kwargs):
    return await nightly_cleanup(ctx, *args, **kwargs)


async def startup(ctx: dict):
    """Worker startup — connect to required services."""
    logger.info("ARQ worker starting up")
    from app.infrastructure.redis_client import redis_session, redis_queue
    await redis_session.connect()
    await redis_queue.connect()
    ctx["redis_session"] = redis_session
    ctx["redis_queue"] = redis_queue
    logger.info("ARQ worker ready")


async def shutdown(ctx: dict):
    """Worker shutdown — close connections."""
    logger.info("ARQ worker shutting down")
    from app.infrastructure.redis_client import redis_session, redis_queue
    await redis_session.close()
    await redis_queue.close()


class WorkerSettings:
    """
    ARQ WorkerSettings class.
    Defines all task functions and their retry policies.
    """
    functions = [
        process_vision_task,
        write_audit_log,
        run_feedback_diagnosis,
        write_semantic_cache,
        record_knowledge_gap,
        create_mock_ticket,
        nightly_cleanup,
        # Canonical task-name aliases for ARQ dispatch
        vision_task,
        audit_task,
        feedback_task,
        cache_task,
        knowledge_gap_task,
        ticket_task,
        cleanup_task,
    ]

    redis_settings = RedisSettings.from_dsn(REDIS_QUEUE_URL)

    max_jobs = 10
    job_timeout = 180
    poll_delay = 0.5
    queue_read_limit = 10

    on_startup = startup
    on_shutdown = shutdown
