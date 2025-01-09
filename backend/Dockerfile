# Cloudrun requires linux amd64, used buildx tool to convert it to linux/amd64
FROM python:3.13-bookworm
LABEL authors="duyhuynh"

WORKDIR /app
COPY requirements.txt /app
# Install OpenGL library for OpenCV
RUN apt-get update && apt-get install -y libgl1-mesa-glx

RUN pip install --no-cache-dir -r requirements.txt --extra-index-url https://download.pytorch.org/whl/nightly/cpu

COPY . /app

EXPOSE 8000

ENTRYPOINT ["python", "app.py"]