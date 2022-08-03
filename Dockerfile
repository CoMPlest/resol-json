FROM node:14.20.0-alpine3.16
RUN addgroup app && adduser -S -G app app
USER app
WORKDIR /resol-json
COPY package.json .
RUN npm install
COPY . .
EXPOSE 3333
CMD npm start