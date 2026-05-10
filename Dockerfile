FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.js ./
COPY routes/ ./routes/
COPY lib/ ./lib/
COPY middleware/ ./middleware/

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "index.js"]
