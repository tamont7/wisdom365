FROM node:20-alpine

WORKDIR /app
COPY package.json ./
COPY server.mjs ./
COPY public ./public
COPY epubs ./epubs

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
