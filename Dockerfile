# Étape 1 : build du frontend React/Vite
FROM node:20-slim AS frontend
WORKDIR /app
COPY frontend/package*.json ./frontend/
RUN npm ci --prefix frontend
COPY frontend ./frontend
RUN npm run build --prefix frontend

# Étape 2 : runtime Node (API + frontend buildé)
FROM node:20-slim AS runtime
WORKDIR /app
COPY backend/package*.json ./backend/
RUN npm ci --prefix backend
COPY backend ./backend
COPY --from=frontend /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production
ENV PORT=3002
ENV TZ=Europe/Paris
EXPOSE 3002

WORKDIR /app/backend
CMD ["node", "server.js"]