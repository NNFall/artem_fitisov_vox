FROM python:3.12-alpine

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY server.py ./server.py
EXPOSE 8080
# Root keeps the host bind-mounted SQLite directory writable without a setup step.
CMD ["python", "server.py"]
