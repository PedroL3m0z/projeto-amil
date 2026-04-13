FROM node:22

WORKDIR /app

COPY package*.json ./
COPY frontend/package*.json ./frontend/

RUN npm ci --include=dev
RUN npm ci --prefix frontend --include=dev

COPY . .

CMD ["npm", "run", "start:dev"]
