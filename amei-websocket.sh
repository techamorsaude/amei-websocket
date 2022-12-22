cd /home/amei-websocket/

sudo git reset --hard

  sudo git pull

  sudo docker container stop amei-websocket || true
  sudo docker kill $(sudo docker ps -q --filter 'ancestor=amei-websocket') || true
  sudo docker rm   $(sudo docker ps -a -q --filter 'ancestor=amei-websocket') || true

 sudo docker build . --no-cache -f DockerfileDev -t amei-websocket

  sudo docker run -dit --restart always --publish 4025:3000 --detach --name amei-websocket amei-websocket
cd