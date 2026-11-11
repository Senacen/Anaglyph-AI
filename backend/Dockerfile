# If require inux amd64, used buildx tool to convert it to linux/amd64
FROM python:3.13-bookworm
LABEL authors="duyhuynh"

WORKDIR /app
COPY requirements.txt /app
# Install OpenGL library for OpenCV
RUN apt-get update && apt-get install -y libgl1-mesa-glx

# Stable CPU-only torch wheels (avoids pulling CUDA builds on amd64)
RUN pip install --no-cache-dir -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu

COPY . /app

EXPOSE 8000

# Doesn't work in docker compose if using localhost, must be 0.0.0.0
# 1 worker process = 1 copy of the model in RAM; threads share it (inference itself is serialised by a lock)
ENTRYPOINT ["gunicorn", "-w", "1", "--threads", "4", "--timeout", "120", "app:app", "-b", "0.0.0.0:8000"]