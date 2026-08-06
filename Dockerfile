FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

# Ensure sample data exists (checked in already, but harmless to regenerate).
RUN node scripts/generate_sample_data.js

EXPOSE 5000
ENV PORT=5000

CMD ["node", "server.js"]
