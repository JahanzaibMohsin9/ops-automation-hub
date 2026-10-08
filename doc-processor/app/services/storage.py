import os

import boto3
from botocore.exceptions import ClientError


class StorageObjectMissingError(FileNotFoundError):
    pass


def _require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"{name} is not configured.")
    return value


def _get_s3_client():
    account_id = _require_env("R2_ACCOUNT_ID")
    access_key_id = _require_env("R2_ACCESS_KEY_ID")
    secret_access_key = _require_env("R2_SECRET_ACCESS_KEY")

    return boto3.client(
        "s3",
        region_name="auto",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
    )


def download_storage_object(storage_key: str) -> bytes:
    bucket_name = _require_env("R2_BUCKET_NAME")
    client = _get_s3_client()

    try:
        response = client.get_object(Bucket=bucket_name, Key=storage_key)
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code in {"NoSuchKey", "404", "NotFound"}:
            raise StorageObjectMissingError(
                "No object was found for the provided storage key."
            ) from exc
        raise

    body = response["Body"].read()
    if not body:
        raise ValueError("The storage object is empty.")

    return body
