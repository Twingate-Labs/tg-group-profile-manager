FROM node:22

# Install app dependencies.
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install

# Bundle app source.
COPY . .
CMD ["node", "app.mjs"]