FROM node:latest

# Install app dependencies.
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install

# Bundle app source.
COPY . .
COPY tg-group-profile-manager.conf ./.env
CMD ["node", "app.mjs"]