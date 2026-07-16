"""
AEGIS MinIO Client
S3-compatible object storage for original documents and screenshots.
Wraps the synchronous minio-py SDK with asyncio.to_thread() for all
blocking calls, since the SDK has no native async support. A direct
call to any SDK method from inside an async def function blocks the
FastAPI event loop for the duration of the network call — every method
below must go through asyncio.to_thread().
"""
import asyncio
import logging
from io import BytesIO
from typing import Tuple

from minio import Minio
from minio.error import S3Error

from app.config import (
    MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_USE_SSL, MINIO_REGION,
    MINIO_BUCKET_DOCUMENTS, MINIO_BUCKET_SCREENSHOTS,
)

logger = logging.getLogger(__name__)


class MinioClient:
    def __init__(self):
        self._client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_USE_SSL,
            region=MINIO_REGION,
        )

    async def ensure_buckets(self) -> None:
        """Idempotent bucket creation. Call once at application startup."""
        for bucket in [MINIO_BUCKET_DOCUMENTS, MINIO_BUCKET_SCREENSHOTS]:
            exists = await asyncio.to_thread(self._client.bucket_exists, bucket)
            if not exists:
                await asyncio.to_thread(self._client.make_bucket, bucket)
                logger.info(f"Created MinIO bucket: {bucket}")

    async def put_object(self, bucket: str, object_key: str, data: bytes, content_type: str) -> str:
        """
        Uploads an object, overwriting silently if the key already exists.
        Overwrite-on-reingest is intentional — mirrors the ingestion pipeline's
        delete_by_document_id + reinsert pattern for Qdrant, not a
        versioned-storage design.
        """
        try:
            await asyncio.to_thread(
                self._client.put_object,
                bucket, object_key, BytesIO(data),
                length=len(data), content_type=content_type,
            )
            return object_key
        except S3Error as e:
            logger.error(f"MinIO put_object failed: bucket={bucket} key={object_key} error={e}")
            raise

    async def get_object(self, bucket: str, object_key: str) -> Tuple[bytes, str]:
        """
        Fetches raw object bytes + content-type for streaming through a
        FastAPI response. Never give the frontend a presigned URL — MINIO_ENDPOINT
        is an internal Docker hostname unreachable from a browser.
        """
        def _fetch():
            response = self._client.get_object(bucket, object_key)
            try:
                data = response.read()
                content_type = response.headers.get("Content-Type", "application/octet-stream")
                return data, content_type
            finally:
                response.close()
                response.release_conn()
        return await asyncio.to_thread(_fetch)

    async def delete_prefix(self, bucket: str, prefix: str) -> int:
        """Deletes all objects under a key prefix. Used for reingestion cleanup and deletion cascades."""
        objects = await asyncio.to_thread(
            lambda: list(self._client.list_objects(bucket, prefix=prefix, recursive=True))
        )
        count = 0
        for obj in objects:
            await asyncio.to_thread(self._client.remove_object, bucket, obj.object_name)
            count += 1
        return count

    async def health_check(self) -> dict:
        try:
            await asyncio.to_thread(self._client.bucket_exists, MINIO_BUCKET_DOCUMENTS)
            return {"status": "healthy"}
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}


minio_client = MinioClient()
