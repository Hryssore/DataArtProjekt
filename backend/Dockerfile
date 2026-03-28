FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p /app/src/storage/uploads /app/src/storage/mailbox

EXPOSE 3000

CMD ["sh", "-c", "npm run migrate && npm start"]
