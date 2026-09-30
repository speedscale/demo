FROM python:3.12-slim

RUN useradd --create-home --uid 10001 app
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

USER app
ENV PORT=8080
EXPOSE 8080
CMD ["python", "app.py"]
