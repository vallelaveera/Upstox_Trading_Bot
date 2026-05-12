# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend
WORKDIR /build
COPY frontend/package.json ./
RUN npm install --legacy-peer-deps && \
    npm install ajv@^8 --no-save --legacy-peer-deps
COPY frontend/ ./
ENV REACT_APP_BACKEND_URL=""
RUN npm run build

# Stage 2: Python backend — serves API + the compiled React app
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
# Copy React build output into backend/static so FastAPI can serve it
COPY --from=frontend /build/build ./static
EXPOSE 8000
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]
