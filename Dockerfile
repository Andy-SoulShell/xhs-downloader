# 构建依赖。
FROM python:3.12-bullseye AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix="/install" -r requirements.txt

# 生成仅含运行环境的最终镜像。
FROM python:3.12-slim

WORKDIR /app
LABEL name="xhs-downloader"

COPY --from=builder /install /usr/local
COPY src /app/src
COPY main.py /app/main.py

EXPOSE 5556
VOLUME /app/volume
CMD ["python", "main.py", "api"]
