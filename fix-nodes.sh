#!/bin/bash
# Fix ghostchain nodes: push correct enode, fix permissions, restart services
set -e
ENODE="enode://ea8e96cf578628995795b854ae78e58bda63dda5eee2c7615c96143f4e3129415c29ace57c0b6408f4be090cf0aab8d78191e84af12c35c1d1c343cd9809c277@10.50.99.20:30301"
SSH="ssh -o StrictHostKeyChecking=no -o BatchMode=yes -i /home/ghost/.ssh/id_ed25519"

echo "=== Node1 (10.50.99.21) ==="
$SSH ghost@10.50.99.21 "
  sudo install -d -m 755 /var/lib/ghostchain/bootnode
  echo '${ENODE}' | sudo tee /var/lib/ghostchain/bootnode/bootnode-enode.txt
  sudo chmod 644 /var/lib/ghostchain/bootnode/bootnode-enode.txt
  sudo chown -R ghost:ghost /var/lib/ghostchain/node1
  echo OK
"

echo "=== Node2 (10.50.99.22) ==="
$SSH ghost@10.50.99.22 "
  sudo install -d -m 755 /var/lib/ghostchain/bootnode
  echo '${ENODE}' | sudo tee /var/lib/ghostchain/bootnode/bootnode-enode.txt
  sudo chmod 644 /var/lib/ghostchain/bootnode/bootnode-enode.txt
  sudo chown -R ghost:ghost /var/lib/ghostchain/node2
  echo OK
"

echo "=== Restarting services ==="
$SSH ghost@10.50.99.21 "sudo systemctl restart ghostchain-node.service"
echo "node1 restart sent"
$SSH ghost@10.50.99.22 "sudo systemctl restart ghostchain-node.service"
echo "node2 restart sent"

sleep 10

echo "=== Status ==="
for entry in "10.50.99.20:ghostchain-bootnode" "10.50.99.21:ghostchain-node" "10.50.99.22:ghostchain-node"; do
  IP="${entry%%:*}"; SVC="${entry##*:}"
  STATUS=$($SSH ghost@${IP} "systemctl is-active ${SVC}.service" 2>&1 || echo inactive)
  echo "  ${IP}  ${SVC}  -> ${STATUS}"
done

echo "=== Node1 last 8 log lines ==="
$SSH ghost@10.50.99.21 "sudo journalctl -u ghostchain-node --no-pager -n 8 2>&1"
