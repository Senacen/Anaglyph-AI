# If require inux amd64, used buildx tool to convert it to linux/amd64
FROM python:3.13-bookworm
LABEL authors="duyhuynh"

WORKDIR /app
COPY requirements.txt /app
# Install OpenGL library for OpenCV
RUN apt-get update && apt-get install -y libgl1-mesa-glx

# Needs to be nightly version to work, as requires version 2.7.0, and stable is 2.6.0
RUN pip3 install --no-cache-dir -r requirements.txt --extra-index-url https://download.pytorch.org/whl/nightly/cpu

COPY . /app

EXPOSE 8000

# Doesn't work in docker compose if using localhost, must be 0.0.0.0
ENTRYPOINT ["gunicorn", "-w", "1", "app:app", "-b", "0.0.0.0:8000"]