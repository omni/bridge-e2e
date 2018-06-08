docker-compose up -d
docker-compose run e2e npm start
rc=$?
docker-compose down
exit $rc
