FROM node:20-alpine
WORKDIR /app
COPY scanner/package.json ./
RUN npm install
COPY scanner/scanner.js ./
CMD ["node", "scanner.js"]
