FROM node:24-alpine AS builder
WORKDIR /app
RUN npm config set registry https://registry.npmmirror.com
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
RUN npm config set registry https://registry.npmmirror.com
COPY --from=builder /app ./
EXPOSE 2000
CMD ["npm", "start"]
