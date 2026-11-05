#!/bin/sh
set -e
cd /certs
if [ -f .done ]; then
  echo "Certificados ya generados"
  exit 0
fi
openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=la-chilena-dev-ca" \
  -keyout ca.key -out ca.crt
for svc in $SERVICES; do
  openssl req -newkey rsa:2048 -nodes -subj "/CN=$svc" -keyout "$svc.key" -out "$svc.csr"
  printf "subjectAltName=DNS:%s,DNS:localhost" "$svc" > "$svc.ext"
  openssl x509 -req -in "$svc.csr" -CA ca.crt -CAkey ca.key -CAcreateserial -days 365 \
    -extfile "$svc.ext" -out "$svc.crt"
  rm -f "$svc.csr" "$svc.ext"
done
rm -f ca.key ca.srl
chmod 644 ./*.crt ./*.key
touch .done
echo "Certificados generados"
