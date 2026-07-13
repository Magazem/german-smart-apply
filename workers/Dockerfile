FROM python:3.11-slim
WORKDIR /app/workers
# scripts/run_pipeline.py does `from common import db` etc. Running it as
# `python scripts/run_pipeline.py` only puts scripts/ (the script's own dir)
# on sys.path, not /app/workers, so those imports fail without this — pytest
# doesn't hit it because pyproject.toml's pythonpath = ["."] covers test runs.
ENV PYTHONPATH=/app/workers
# Without this, Python fully buffers stdout when it isn't a TTY (true of any
# container's main process) - confirmed live on Fly: `fly logs` showed
# nothing but boot messages for the whole ~4 minute run, then every
# print() at once right as the process exited. Line-buffers so `fly logs`
# / `docker logs -f` show progress as it happens instead of only at exit.
ENV PYTHONUNBUFFERED=1

COPY workers/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY workers/ .

# Runs the full seed -> crawl -> normalize -> dedup pipeline once per
# container start, then exits. Scheduled in production via
# .github/workflows/crawl-pipeline.yml (GitHub Actions cron -> `fly deploy`
# against workers/fly.toml, which has no [http_service] - each scheduled
# tick gets a fresh machine that runs this to completion and exits).
CMD ["python", "scripts/run_pipeline.py"]
