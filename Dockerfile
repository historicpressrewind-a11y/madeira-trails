FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV ADMIN_TOKEN=change-me
EXPOSE 3000
CMD ["node", "server.js"]
