FROM node:8

RUN mkdir /stuff
WORKDIR /stuff

COPY package.json .
COPY package-lock.json .
COPY .git .git
COPY .gitmodules .

RUN npm install --unsafe-perm

COPY envs envs

COPY index.js .

CMD ["npm", "start"]
