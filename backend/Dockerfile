# Built on an Apple Silicon Mac, which produces linux/arm64 images that run directly on the Raspberry Pi.
# (For an amd64 host, build with: docker buildx build --platform linux/amd64 ...)
FROM python:3.13-slim-bookworm
LABEL authors="duyhuynh"

WORKDIR /app
# Print straight to the container log (otherwise timings sit in a buffer and never show in `docker compose logs`)
ENV PYTHONUNBUFFERED=1
COPY requirements.txt /app

# opencv-python-headless needs no system OpenGL libraries; inference uses onnxruntime (no torch at runtime).
RUN pip install --no-cache-dir -r requirements.txt

# Code + int8 ONNX depth model only; the example images are mounted at runtime (see docker-compose.yml and .dockerignore)
COPY . /app

EXPOSE 8000

# Must bind 0.0.0.0 (not localhost) to be reachable from outside the container.
# 1 worker process = 1 copy of the model in RAM; threads share it (inference itself is serialised by a lock).
ENTRYPOINT ["gunicorn", "-w", "1", "--threads", "4", "--timeout", "120", "app:app", "-b", "0.0.0.0:8000"]
