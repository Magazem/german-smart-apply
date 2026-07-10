FROM python:3.11-slim
WORKDIR /app/workers

COPY workers/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY workers/ .

# Phase 1: runs the full seed -> crawl -> normalize -> dedup pipeline once
# per container start/`docker compose run worker`. Production scheduling per
# source crawl_frequency_minutes (cron / a k8s CronJob per source) is a
# Phase 2+ concern - see plan.md's Source Ingestion Layer "Scheduler" bullet.
CMD ["python", "scripts/run_pipeline.py"]
